"""공개 입력만 폐기 가능한 로컬 엔진에서 비교한다. 운영 주소·계정은 받지 않는다."""
import argparse
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

import numpy as np
import onnxruntime as ort
import psutil
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[1]
MODEL_REVISION = '614241f622f53c4eeff9890bdc4f31cfecc418b3'
MODEL_FILES = {
    'onnx/model_qint8_avx512_vnni.onnx': 'dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88',
    'onnx/tokenizer.json': '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
}
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def docker(*args, timeout=180, env=None, data=None):
    result = subprocess.run(['docker', '--context', 'default', *args], input=data, text=True,
                            capture_output=True, timeout=timeout, env=env)
    if result.returncode:
        raise RuntimeError('Local Docker operation failed: ' + args[0])
    return result.stdout.strip()


def request(url, body=None, method=None):
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=payload, method=method,
                                 headers={'Content-Type': 'application/json'})
    with HTTP.open(req, timeout=15) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


class Engine:
    def __init__(self, kind):
        self.kind = kind
        self.owner = secrets.token_hex(16)
        self.name = 'reserve-search-' + kind + '-' + self.owner[:8]
        self.image = {'opensearch': 'opensearchproject/opensearch:3.9.0', 'qdrant': 'qdrant/qdrant:v1.20.0'}[kind]
        self.id = None
        self.base = None
        self.image_existed = bool(subprocess.run(['docker', '--context', 'default', 'image', 'inspect', self.image], capture_output=True).returncode == 0)

    def start(self):
        for _ in range(60):
            if psutil.virtual_memory().available >= 1536 * 1024 ** 2:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('At least 1536MiB available host RAM is required before an engine starts')
        port = '9200' if self.kind == 'opensearch' else '6333'
        options = ['run', '--detach', '--name', self.name, '--label', 'kr.it.reserve.search-test-owner=' + self.owner,
                   '--memory=' + ('1024m' if self.kind == 'opensearch' else '512m'),
                   '--memory-swap=' + ('1024m' if self.kind == 'opensearch' else '512m'),
                   '--pids-limit=256', '--cpus=1', '--publish', '127.0.0.1::' + port]
        if self.kind == 'opensearch':
            options += ['--env', 'discovery.type=single-node', '--env', 'DISABLE_INSTALL_DEMO_CONFIG=true',
                        '--env', 'DISABLE_SECURITY_PLUGIN=true', '--env', 'OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m -XX:ActiveProcessorCount=1',
                        '--entrypoint', '/bin/bash', self.image, '-c',
                        'if [ ! -d plugins/analysis-nori ]; then bin/opensearch-plugin install --batch analysis-nori >/tmp/plugin-install.log 2>&1 || exit 1; fi; exec ./opensearch-docker-entrypoint.sh opensearch']
        else:
            options += [self.image]
        print('Starting bounded local ' + self.kind, flush=True)
        self.id = docker(*options, timeout=300)
        if len(self.id) != 64:
            raise RuntimeError('Invalid owned container identity')
        address = docker('port', self.id, port + '/tcp')
        if not address.startswith('127.0.0.1:') or not address.split(':')[-1].isdigit():
            raise RuntimeError('Engine must publish only to loopback')
        self.base = 'http://' + address
        for _ in range(120):
            try:
                request(self.base)
                return
            except (OSError, ValueError):
                if docker('inspect', '--format', '{{.State.Running}}', self.id) != 'true':
                    raise RuntimeError('Owned engine exited; host settings will not be changed')
                time.sleep(0.5)
        raise RuntimeError('Owned engine readiness timed out')

    def resources(self):
        memory = docker('stats', '--no-stream', '--format', '{{.MemUsage}}', self.id)
        peak = docker('exec', self.id, 'cat', '/sys/fs/cgroup/memory.peak')
        disk = docker('exec', self.id, 'du', '-sk', '/usr/share/opensearch/data' if self.kind == 'opensearch' else '/qdrant/storage')
        return {'dockerMemory': memory, 'cgroupPeakMiB': round(int(peak) / 1024 ** 2, 2),
                'storageKiB': int(disk.split()[0]), 'oomKilled': docker('inspect', '--format', '{{.State.OOMKilled}}', self.id)}

    def close(self):
        if not self.id:
            self.id = docker('ps', '--all', '--quiet', '--no-trunc', '--filter', 'label=kr.it.reserve.search-test-owner=' + self.owner) or None
        if self.id:
            owner = docker('inspect', '--format', '{{ index .Config.Labels "kr.it.reserve.search-test-owner" }}', self.id)
            if owner != self.owner:
                raise RuntimeError('Refusing cleanup of an unowned container')
            docker('rm', '--force', '--volumes', self.id)
        image_exists = subprocess.run(['docker', '--context', 'default', 'image', 'inspect', self.image], capture_output=True).returncode == 0
        if not self.image_existed and image_exists and not docker('ps', '--all', '--quiet', '--filter', 'ancestor=' + self.image):
            docker('image', 'rm', self.image)


def fetch_model(directory):
    paths = []
    for file, expected in MODEL_FILES.items():
        target = directory / Path(file).name
        url = 'https://huggingface.co/intfloat/multilingual-e5-small/resolve/' + MODEL_REVISION + '/' + file
        with HTTP.open(url, timeout=60) as response, target.open('wb') as output:
            shutil.copyfileobj(response, output)
        with target.open('rb') as source:
            actual_hash = hashlib.file_digest(source, 'sha256').hexdigest()
        if actual_hash != expected:
            raise RuntimeError('Embedding artifact hash mismatch')
        paths.append(target)
    return paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engines', choices=['both', 'opensearch', 'qdrant'], default='both')
    parser.add_argument('--case-kind', choices=['all', 'positive', 'none'], default='all')
    args = parser.parse_args()
    endpoint = docker('context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}')
    if not (endpoint.startswith('npipe:////./pipe/') or endpoint.startswith('unix:///')):
        raise RuntimeError('Only the default local Docker engine is allowed')
    fixture = json.loads((ROOT / 'scripts/fixtures/search-public-places.json').read_text(encoding='utf-8'))
    docs = fixture['documents']
    cases = [case for case in fixture['queries'] if args.case_kind == 'all'
             or (case['kind'] == 'none') == (args.case_kind == 'none')]
    if fixture['license'] != 'CC0-1.0' or len(docs) > 100 or len(cases) > 20:
        raise RuntimeError('Public evaluation input exceeds the reviewed scope')
    parent = ROOT / 'backend/build'
    parent.mkdir(parents=True, exist_ok=True)
    if not parent.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('Evaluation cache must remain inside the workspace')
    cache = Path(tempfile.mkdtemp(prefix='search-engine-model-', dir=parent))
    session = tokenizer = None
    try:
        model, tokenizer_file = fetch_model(cache)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
        tokenizer = Tokenizer.from_file(str(tokenizer_file))
        tokenizer.enable_truncation(max_length=256)
        tokenizer.enable_padding(pad_id=1, pad_token='<pad>')

        def embed(text):
            encoded = tokenizer.encode(text)
            feeds = {'input_ids': np.array([encoded.ids], dtype=np.int64),
                     'attention_mask': np.array([encoded.attention_mask], dtype=np.int64),
                     'token_type_ids': np.zeros((1, len(encoded.ids)), dtype=np.int64)}
            hidden = session.run(None, {item.name: feeds[item.name] for item in session.get_inputs()})[0]
            mask = feeds['attention_mask'][..., None]
            pooled = (hidden * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
            vector = pooled[0].astype(np.float32)
            return vector / max(float(np.linalg.norm(vector)), 1e-12)

        vectors = np.stack([embed('passage: ' + doc['name'] + ' ' + doc['description']) for doc in docs])
        print(json.dumps({'publicDocuments': len(docs), 'queries': len(cases), 'dimensions': vectors.shape[1],
                          'embeddingModel': 'intfloat/multilingual-e5-small', 'modelRevision': MODEL_REVISION,
                          'embeddingProcessRssMiB': round(psutil.Process().memory_info().rss / 1024 ** 2, 2)}), flush=True)
        for kind in (['opensearch', 'qdrant'] if args.engines == 'both' else [args.engines]):
            engine = Engine(kind)
            try:
                engine.start()
                if kind == 'opensearch':
                    mapping = {'settings': {'index': {'knn': True, 'number_of_shards': 1, 'number_of_replicas': 0},
                                'analysis': {'analyzer': {'ko': {'type': 'custom', 'tokenizer': 'nori_tokenizer', 'filter': ['lowercase']}}}},
                               'mappings': {'properties': {'sourceId': {'type': 'keyword'}, 'visibility': {'type': 'keyword'},
                                 'name': {'type': 'text', 'analyzer': 'ko', 'fields': {'raw': {'type': 'keyword'}}},
                                 'description': {'type': 'text', 'analyzer': 'ko'},
                                 'vector': {'type': 'knn_vector', 'dimension': 384, 'method': {'name': 'hnsw', 'engine': 'lucene', 'space_type': 'cosinesimil', 'parameters': {'m': 8, 'ef_construction': 64}}}}}}
                    request(engine.base + '/public-search', mapping, 'PUT')
                    for i, doc in enumerate(docs):
                        request(engine.base + '/public-search/_doc/' + doc['id'], {**doc, 'sourceId': doc['id'], 'vector': vectors[i].tolist()}, 'PUT')
                    request(engine.base + '/public-search/_refresh', {}, 'POST')
                else:
                    request(engine.base + '/collections/public-search', {'vectors': {'size': 384, 'distance': 'Cosine', 'on_disk': True},
                            'hnsw_config': {'m': 8, 'ef_construct': 64, 'on_disk': True}, 'optimizers_config': {'indexing_threshold': 1}}, 'PUT')
                    request(engine.base + '/collections/public-search/points?wait=true', {'points': [
                        {'id': i, 'vector': vectors[i].tolist(), 'payload': {**doc, 'sourceId': doc['id']}} for i, doc in enumerate(docs)]}, 'PUT')
                modes = ['keyword', 'vector', 'hybrid'] if kind == 'opensearch' else ['vector']
                for mode in modes:
                    times, ranks, recalls, unexpected = [], [], [], []
                    for repeat in range(4):
                        for case in cases:
                            start = time.perf_counter()
                            vector = embed('query: ' + case['text']) if mode != 'keyword' else None
                            lexical = {'bool': {'filter': [{'term': {'visibility': 'public'}}], 'minimum_should_match': 1, 'should': [
                                {'term': {'name.raw': {'value': case['text'], 'boost': 20}}},
                                {'multi_match': {'query': case['text'], 'fields': ['name^4', 'description'], 'fuzziness': 'AUTO'}}]}}
                            if kind == 'opensearch':
                                def search(query):
                                    return [row['_source']['sourceId'] for row in request(engine.base + '/public-search/_search',
                                            {'size': 10, '_source': ['sourceId'], 'query': query}, 'POST')['hits']['hits']]
                                lexical_ids = search(lexical) if mode != 'vector' else []
                                vector_ids = search({'knn': {'vector': {'vector': vector.tolist(), 'k': 10,
                                    'filter': {'term': {'visibility': 'public'}}}}}) if mode != 'keyword' else []
                                ids = lexical_ids if mode == 'keyword' else vector_ids
                                if mode == 'hybrid':
                                    fused = {}
                                    for rows in [lexical_ids, vector_ids]:
                                        for rank, key in enumerate(rows, 1): fused[key] = fused.get(key, 0) + 1 / (60 + rank)
                                    ids = sorted(fused, key=fused.get, reverse=True)
                            else:
                                result = request(engine.base + '/collections/public-search/points/query', {'query': vector.tolist(), 'limit': 10,
                                    'filter': {'must': [{'key': 'visibility', 'match': {'value': 'public'}}]}, 'with_payload': ['sourceId']}, 'POST')
                                ids = [row['payload']['sourceId'] for row in result['result']['points']]
                            elapsed = (time.perf_counter() - start) * 1000
                            if repeat:
                                times.append(elapsed)
                                if case['expected']:
                                    ranks.append(next((1 / (i + 1) for i, key in enumerate(ids[:5]) if key in case['expected']), 0))
                                else:
                                    unexpected.append(bool(ids[:5]))
                                if vector is not None and mode == 'vector':
                                    exact = {docs[i]['id'] for i in np.argsort(-(vectors @ vector))[:5]}
                                    recalls.append(len(exact.intersection(ids[:5])) / 5)
                    print(json.dumps({'engine': kind, 'mode': mode, 'samples': len(times), 'p95Ms': round(float(np.percentile(times, 95)), 3),
                            'mrrAt5': round(float(np.mean(ranks)), 4) if ranks else None,
                            'hitAt5': round(sum(value > 0 for value in ranks) / len(ranks), 4) if ranks else None,
                            'unexpectedResultRate': round(sum(unexpected) / len(unexpected), 4) if unexpected else None,
                            'annRecallAt5': round(float(np.mean(recalls)), 4) if recalls else None,
                            'includesQueryEmbedding': mode != 'keyword', 'resources': engine.resources()}, ensure_ascii=False), flush=True)
            finally:
                engine.close()
    finally:
        session = tokenizer = None
        gc.collect()
        target, parent = cache.resolve(), parent.resolve()
        if target.parent != parent or not target.name.startswith('search-engine-model-'):
            raise RuntimeError('Unsafe model cleanup target')
        shutil.rmtree(target)


if __name__ == '__main__':
    main()
