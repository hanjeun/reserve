package emailtemplate

import (
	"bytes"
	"html/template"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

// Only synthetic data is used. No SMTP connection or production API is called.
type pair struct{ Name, Value string }
type labels map[string]string

func (l labels) SortedPairs() []pair {
	keys := make([]string, 0, len(l))
	for key := range l {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	pairs := make([]pair, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, pair{key, l[key]})
	}
	return pairs
}

type alert struct {
	Labels, Annotations                                                       labels
	Values                                                                    map[string]float64
	GeneratorURL, ImageURL, EmbeddedImage, SilenceURL, DashboardURL, PanelURL string
	StartsAt                                                                  time.Time
}
type alerts struct{ Firing, Resolved []alert }
type message struct {
	Subject                                     *string
	TemplateData                                map[string]any
	Alerts                                      alerts
	GroupLabels                                 labels
	Message, AlertPageUrl, AppUrl, BuildVersion string
}

func sampleAlert() alert {
	return alert{
		Labels: labels{"alertname": "RESERVE · 결제 운영 큐 미결", "grafana_folder": "RESERVE Operations"},
		Annotations: labels{"summary": "결제 운영 큐 미결",
			"description": "불일치 방향과 예약·환불·PG 상태를 읽기 전용으로 대조해주세요.\n플래그 직접 수정이나 자동 환불은 하지 않아요.",
			"runbook_url": "https://example.test/payments", "owner": "운영 담당자"},
		Values:       map[string]float64{"A": 2, "B": 2, "C": 1},
		GeneratorURL: "https://grafana.example.test/alerting/grafana/example/view",
		DashboardURL: "https://grafana.example.test/d/example", PanelURL: "https://grafana.example.test/d/example?viewPanel=1",
		SilenceURL: "https://grafana.example.test/alerting/silence/new",
		StartsAt:   time.Date(2026, 9, 30, 2, 15, 0, 0, time.UTC),
	}
}

func sampleMessage() message {
	subject := ""
	return message{Subject: &subject, TemplateData: map[string]any{"Title": "[FIRING:1] RESERVE · 결제 운영 큐 미결"},
		Alerts: alerts{Firing: []alert{sampleAlert()}}, GroupLabels: labels{"grafana_folder": "RESERVE Operations"},
		AlertPageUrl: "https://grafana.example.test/alerting/list", AppUrl: "https://grafana.example.test/", BuildVersion: "10.2.0"}
}

func render(t *testing.T, data message) string {
	t.Helper()
	_, source, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(source), "..", "..", "grafana", "emails", "ng_alert_notification.html")
	functions := template.FuncMap{
		"splitList": strings.Split,
		"Subject": func(subject *string, values map[string]any, fallback string) string {
			if *subject == "" {
				parsed, err := template.New("subject").Parse(fallback)
				if err != nil {
					t.Fatal(err)
				}
				var out bytes.Buffer
				if err = parsed.Execute(&out, values); err != nil {
					t.Fatal(err)
				}
				*subject = out.String()
			}
			return *subject
		},
	}
	// Sprig's splitList uses (separator, value), unlike strings.Split.
	functions["splitList"] = func(separator, value string) []string { return strings.Split(value, separator) }
	parsed, err := template.New(filepath.Base(path)).Funcs(functions).Option("missingkey=zero").ParseFiles(path)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err = parsed.Execute(&out, data); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func TestFiring(t *testing.T) {
	data := sampleMessage()
	body := render(t, data)
	for _, expected := range []string{"확인 필요 · 1건", "결제 기록을 확인해주세요", "알림 상세 확인", "확인 방법", "대시보드", "패널", "알림 일시 중지 설정", "확인 요청 로그 · 최근 20분", "A = 2", "owner", "2026-09-30 02:15:00 UTC", "Grafana v10.2.0"} {
		if !strings.Contains(body, expected) {
			t.Errorf("missing %q", expected)
		}
	}
	if *data.Subject != "[FIRING:1] RESERVE · 결제 운영 큐 미결" {
		t.Fatal("subject contract changed")
	}
	if strings.Contains(body, "#ZgotmplZ") {
		t.Fatal("a normal link was rejected")
	}
	if directory := os.Getenv("RESERVE_EMAIL_PREVIEW_DIR"); directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "grafana-email-firing.html"), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestResolvedAndMixed(t *testing.T) {
	for _, firing := range []bool{false, true} {
		data := sampleMessage()
		data.Alerts.Resolved = []alert{sampleAlert()}
		if !firing {
			data.Alerts.Firing = nil
		}
		body := render(t, data)
		if !strings.Contains(body, "알림 조건 해제 · 1건") {
			t.Fatal("resolved status missing")
		}
		if !firing && (!strings.Contains(body, "알림 조건이") || strings.Contains(body, "원인이 해결")) {
			t.Fatal("resolved semantics overstated")
		}
		if firing && !strings.Contains(body, "확인 필요 · 1건") {
			t.Fatal("mixed notification lost firing")
		}
	}
}

func TestNoDecorativeCopy(t *testing.T) {
	body := render(t, sampleMessage())
	for _, removed := range []string{"OPERATIONS · 운영 알림", "관측된 상태와 대응 절차를", "자동으로 보낸 메일이에요", "별도 확인과 승인이 필요해요"} {
		if strings.Contains(body, removed) {
			t.Errorf("decorative copy remains: %q", removed)
		}
	}
	if !strings.Contains(body, "확인 전에는 결제 표시를 직접 바꾸거나 환불을 다시 실행하지 않아요.") || !strings.Contains(body, "플래그 직접 수정이나 자동 환불은 하지 않아요.") {
		t.Fatal("actual alert description was removed with decorative copy")
	}
}

func TestPaymentSignalIsNotAReservationCount(t *testing.T) {
	body := render(t, sampleMessage())
	for _, expected := range []string{"확인 요청 로그 · 최근 20분", "2회 남았어요. 영향받는 예약 수와는 달라요.", "중복 결제나 환불 실패가 확인된 것은 아니에요.", "진단용 값"} {
		if !strings.Contains(body, expected) {
			t.Errorf("missing %q", expected)
		}
	}
	if strings.Count(body, "color:#b42332") != 1 || strings.Contains(body, "FIRING ·") || strings.Contains(body, "RESOLVED ·") {
		t.Fatal("status wording or warning duplication regressed")
	}
	data := sampleMessage()
	delete(data.Alerts.Firing[0].Values, "A")
	if strings.Contains(render(t, data), "확인 요청 로그 · 최근 20분") {
		t.Fatal("missing query value was invented")
	}
}

func TestUnavailableSignalDoesNotClaimPaymentFailure(t *testing.T) {
	for _, source := range []string{"DatasourceError", "DatasourceNoData", "Error", "NoData"} {
		data := sampleMessage()
		if strings.HasPrefix(source, "Datasource") {
			data.Alerts.Firing[0].Labels["alertname"] = source
		} else {
			data.Alerts.Firing[0].Annotations["grafana_state_reason"] = source
		}
		body := render(t, data)
		if !strings.Contains(body, "알림을 점검할 데이터를 읽지 못했어요") || strings.Contains(body, "회 남았어요") || strings.Contains(body, "결제 처리나 예약금 표시에 확인할 내용이 있어요.") {
			t.Fatal("missing or failed query was presented as a payment event")
		}
	}
}

func TestOptionalFieldsAndEmptyAlerts(t *testing.T) {
	data := sampleMessage()
	data.Alerts.Firing = []alert{{Labels: labels{}, Annotations: labels{}, StartsAt: time.Time{}}}
	body := render(t, data)
	if strings.Contains(body, "<no value>") || strings.Contains(body, "#ZgotmplZ") {
		t.Fatal("missing optional field leaked")
	}
	data.Alerts.Firing = nil
	if !strings.Contains(render(t, data), "운영 알림을") {
		t.Fatal("empty notification fallback missing")
	}
}

func TestCustomMessageRemainsPlainText(t *testing.T) {
	data := sampleMessage()
	data.Message = "첫 번째 줄\n<script>alert(1)</script>"
	body := render(t, data)
	if !strings.Contains(body, "첫 번째 줄<br>") || !strings.Contains(body, "&lt;script&gt;") {
		t.Fatal("custom message escaped incorrectly")
	}
	if strings.Contains(body, "<script>") || strings.Contains(body, "관측값") {
		t.Fatal("custom-message override changed")
	}
}

func TestUntrustedDataAndLinks(t *testing.T) {
	data := sampleMessage()
	data.Alerts.Firing[0].Labels["alertname"] = "<script>unsafe</script>"
	data.Alerts.Firing[0].Annotations["description"] = "<img src=x onerror=alert(1)>"
	data.Alerts.Firing[0].GeneratorURL = "javascript:alert(1)"
	data.Alerts.Firing[0].ImageURL = "javascript:alert(1)"
	body := render(t, data)
	if strings.Contains(body, "<script>") || strings.Contains(body, "<img src=x") || strings.Contains(body, "javascript:") {
		t.Fatal("untrusted HTML or URL rendered")
	}
	if !strings.Contains(body, "&lt;script&gt;") || !strings.Contains(body, "#ZgotmplZ") {
		t.Fatal("HTML-template autoescaping not exercised")
	}
}

func TestImages(t *testing.T) {
	data := sampleMessage()
	data.Alerts.Firing[0].ImageURL = "https://grafana.example.test/image.png"
	data.Alerts.Firing[0].EmbeddedImage = "graph@example.test"
	body := render(t, data)
	if !strings.Contains(body, "https://grafana.example.test/image.png") || !strings.Contains(body, "cid:graph@example.test") {
		t.Fatal("alert images lost")
	}
}
