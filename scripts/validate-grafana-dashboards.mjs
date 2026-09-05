import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dashboardPolicies = [
  {
    file: 'grafana/dashboards/reserve-logs.json',
    uid: 'reserve-logs',
    maxActiveQueries: 10,
    collapsedRowIds: [102, 103, 104, 105, 106, 107],
    zeroFallbackForStats: true,
  },
  {
    file: 'grafana/dashboards/reserve-hardware.json',
    uid: 'reserve-hardware',
    maxActiveQueries: 6,
    collapsedRowIds: [101, 102, 103],
    zeroFallbackForStats: false,
  },
];

const failures = [];
const summaries = [];

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

function visitPanels(panels, visitor, parents = []) {
  for (const panel of panels ?? []) {
    visitor(panel, parents);
    visitPanels(panel.panels, visitor, [...parents, panel]);
  }
}

function activeQueryCount(dashboard) {
  const panelQueries = (dashboard.panels ?? [])
    .filter((panel) => panel.type !== 'row')
    .reduce((count, panel) => count + (panel.targets?.length ?? 0), 0);
  const annotationQueries = (dashboard.annotations?.list ?? [])
    .filter((annotation) => annotation.enable !== false && annotation.datasource?.type === 'loki')
    .length;

  return panelQueries + annotationQueries;
}

for (const policy of dashboardPolicies) {
  const absolutePath = path.join(repositoryRoot, policy.file);
  let dashboard;

  try {
    dashboard = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(policy.file, `valid JSON required (${error.message})`);
    continue;
  }

  if (dashboard.uid !== policy.uid) {
    fail(policy.file, `uid must remain ${policy.uid}`);
  }
  if (dashboard.refresh !== '5m') {
    fail(policy.file, 'refresh must remain 5m to protect the single-node Loki instance');
  }

  const activeQueries = activeQueryCount(dashboard);
  if (activeQueries > policy.maxActiveQueries) {
    fail(
      policy.file,
      `default view runs ${activeQueries} queries (budget: ${policy.maxActiveQueries})`,
    );
  }

  for (const panel of dashboard.panels ?? []) {
    if (!['row', 'stat'].includes(panel.type)) {
      fail(policy.file, `top-level panel ${panel.id} (${panel.type}) must be inside a collapsed row`);
    }
  }

  const panelIds = new Set();
  visitPanels(dashboard.panels, (panel, parents) => {
    if (panelIds.has(panel.id)) {
      fail(policy.file, `duplicate panel id ${panel.id}`);
    }
    panelIds.add(panel.id);

    const refIds = new Set();
    for (const target of panel.targets ?? []) {
      if (refIds.has(target.refId)) {
        fail(policy.file, `panel ${panel.id} has duplicate refId ${target.refId}`);
      }
      refIds.add(target.refId);

      if (target.datasource?.type === 'loki' && target.datasource.uid !== '${DS_LOKI}') {
        fail(policy.file, `panel ${panel.id} must use the import-time Loki placeholder`);
      }

      const isRangeAggregation = target.queryType === 'range'
        && /(?:count|avg|sum|min|max|last)_over_time\(/.test(target.expr ?? '');
      if (isRangeAggregation && !target.expr.includes('$__auto')) {
        fail(policy.file, `panel ${panel.id} range aggregation must use $__auto`);
      }
    }

    if (panel.type === 'stat') {
      if ((panel.targets?.length ?? 0) !== 1 || panel.targets?.[0]?.queryType !== 'instant') {
        fail(policy.file, `stat panel ${panel.id} must use exactly one instant query`);
      }
      if (panel.options?.graphMode !== 'none' || panel.options?.textMode !== 'value') {
        fail(policy.file, `stat panel ${panel.id} must hide query labels and sparklines`);
      }
      if (panel.fieldConfig?.defaults?.noValue === '0') {
        fail(policy.file, `stat panel ${panel.id} must not present missing data as zero`);
      }
      if (policy.zeroFallbackForStats && !panel.targets?.[0]?.expr?.includes('or vector(0)')) {
        fail(policy.file, `stat panel ${panel.id} needs an explicit zero fallback`);
      }
    }

    if (parents.some((parent) => parent.type === 'row' && parent.collapsed !== true)) {
      fail(policy.file, `nested panel ${panel.id} belongs to a row that is not collapsed`);
    }
  });

  for (const rowId of policy.collapsedRowIds) {
    const row = (dashboard.panels ?? []).find((panel) => panel.id === rowId);
    if (!row || row.type !== 'row' || row.collapsed !== true || !row.panels?.length) {
      fail(policy.file, `row ${rowId} must remain collapsed and own its detail panels`);
    }
  }

  const deploymentAnnotation = (dashboard.annotations?.list ?? [])
    .find((annotation) => annotation.datasource?.type === 'loki');
  if (deploymentAnnotation?.name !== '배포 시점') {
    fail(policy.file, 'deployment annotation label must be user-facing');
  }

  if (policy.uid === 'reserve-logs') {
    const search = dashboard.templating?.list?.find((variable) => variable.name === 'search');
    if (!search || search.query !== '' || search.current?.value !== '') {
      fail(policy.file, 'log search must start blank instead of exposing the .* regular expression');
    }
  }

  summaries.push(`${policy.uid}: ${activeQueries}/${policy.maxActiveQueries} active queries`);
}

if (failures.length > 0) {
  console.error('Grafana dashboard validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Grafana dashboard validation passed (${summaries.join(', ')}).`);
}
