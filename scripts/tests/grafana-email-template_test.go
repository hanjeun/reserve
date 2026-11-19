package emailtemplate

import (
	"bytes"
	"html/template"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const rejectedURLMarker = "#ZgotmplZ"

// 합성 데이터만 사용하며 SMTP나 운영 API에 연결하지 않는다.
type labels map[string]string

type alert struct {
	Status                                                                    string
	Labels, Annotations                                                       labels
	Values                                                                    map[string]float64
	GeneratorURL, ImageURL, EmbeddedImage, SilenceURL, DashboardURL, PanelURL string
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
		Status: "firing",
		Labels: labels{"alertname": "RESERVE · 결제 운영 큐 미결", "grafana_folder": "RESERVE Operations"},
		Annotations: labels{"summary": "결제 운영 큐 미결",
			"description": "불일치 방향과 예약·환불·PG 상태를 읽기 전용으로 대조해주세요.\n플래그 직접 수정이나 자동 환불은 하지 않아요.",
			"runbook_url": "https://example.test/payments", "owner": "운영 담당자"},
		Values:       map[string]float64{"A": 2, "B": 2, "C": 1},
		GeneratorURL: "https://grafana.example.test/alerting/grafana/example/view",
		DashboardURL: "https://grafana.example.test/d/example", PanelURL: "https://grafana.example.test/d/example?viewPanel=1",
		SilenceURL: "https://grafana.example.test/alerting/silence/new",
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
	// splitList는 구분자·문자열 순서로 인자를 받는다.
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
	for _, expected := range []string{"확인 필요</span>", "결제 기록 확인", "결제·환불 기록을 읽기 전용으로 확인해주세요.", "알림 상세 확인", data.Alerts.Firing[0].GeneratorURL, "확인 방법", "전체 알림 보기", "#3182f6", "#1b64da"} {
		if !strings.Contains(body, expected) {
			t.Errorf("missing %q", expected)
		}
	}
	if *data.Subject != "[FIRING:1] RESERVE · 결제 운영 큐 미결" {
		t.Fatal("subject contract changed")
	}
	if strings.Contains(body, rejectedURLMarker) {
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
		resolved := sampleAlert()
		resolved.Status = "resolved"
		data.Alerts.Resolved = []alert{resolved}
		if !firing {
			data.Alerts.Firing = nil
		}
		body := render(t, data)
		if !strings.Contains(body, "조건 해제</span>") {
			t.Fatal("resolved status missing")
		}
		if strings.Contains(body, "확인 필요</span>") != firing || strings.Contains(body, "읽기 전용으로 확인해주세요") != firing {
			t.Fatal("firing content rendered for the wrong status")
		}
	}
}

func TestBackupWarningKeepsOneSummary(t *testing.T) {
	data := sampleMessage()
	report := &data.Alerts.Firing[0]
	report.Labels["alertname"] = "RESERVE · 정기 백업 부재"
	report.Annotations["summary"] = "최근 26시간 동안 정기 백업 완료 로그가 없어요."
	report.Annotations["description"] = "서버 백업 작업과 수집 상태를 확인해주세요."
	body := render(t, data)
	if !strings.Contains(body, ">정기 백업 부재</h2>") || strings.Count(body, report.Annotations["summary"]) != 1 {
		t.Fatal("backup warning title or summary missing")
	}
	if strings.Contains(body, report.Annotations["description"]) || strings.Contains(body, "백업 실패") {
		t.Fatal("backup warning duplicated diagnostics or misstated the signal")
	}
}

func TestDiagnosticsStayInAlertDetails(t *testing.T) {
	body := render(t, sampleMessage())
	for _, removed := range []string{"진단용 값", "A = 2", "grafana_folder", "운영 담당자", "발생 시각", "알림 일시 중지 설정", "Grafana Labs", "원본 설명"} {
		if strings.Contains(body, removed) {
			t.Errorf("technical detail remains in the mail: %q", removed)
		}
	}
}

func TestGroupedStatusCountsAlerts(t *testing.T) {
	data := sampleMessage()
	data.Alerts.Firing = append(data.Alerts.Firing, sampleAlert())
	body := render(t, data)
	if strings.Count(body, "확인 필요 · 2건") != 1 || strings.Count(body, "알림 상세 확인") != 2 {
		t.Fatal("grouped alert count or detail links missing")
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
		if !strings.Contains(body, "알림 데이터를 읽지 못했어요") || strings.Contains(body, "결제·환불 기록을 읽기 전용으로 확인해주세요.") {
			t.Fatal("missing or failed query was presented as a payment event")
		}
	}
}

func TestOptionalFieldsAndEmptyAlerts(t *testing.T) {
	data := sampleMessage()
	data.Alerts.Firing = []alert{{Labels: labels{}, Annotations: labels{}}}
	body := render(t, data)
	if strings.Contains(body, "<no value>") || strings.Contains(body, rejectedURLMarker) {
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
	delete(data.Alerts.Firing[0].Annotations, "summary")
	data.Alerts.Firing[0].Annotations["description"] = "<img src=x onerror=alert(1)>"
	data.Alerts.Firing[0].GeneratorURL = "javascript:alert(1)"
	data.Alerts.Firing[0].ImageURL = "javascript:alert(1)"
	body := render(t, data)
	if strings.Contains(body, "<script>") || strings.Contains(body, "<img src=x") || strings.Contains(body, "javascript:") {
		t.Fatal("untrusted HTML or URL rendered")
	}
	if !strings.Contains(body, "&lt;script&gt;") || !strings.Contains(body, "&lt;img") || !strings.Contains(body, rejectedURLMarker) {
		t.Fatal("HTML-template autoescaping not exercised")
	}
}

func TestUsesOneAlertImage(t *testing.T) {
	data := sampleMessage()
	report := &data.Alerts.Firing[0]
	report.ImageURL = "https://grafana.example.test/image.png"
	report.EmbeddedImage = "graph@example.test"
	body := render(t, data)
	if strings.Contains(body, report.ImageURL) || !strings.Contains(body, "cid:graph@example.test") {
		t.Fatal("embedded alert image was duplicated")
	}
	report.EmbeddedImage = ""
	if !strings.Contains(render(t, data), report.ImageURL) {
		t.Fatal("external fallback image missing")
	}
}
