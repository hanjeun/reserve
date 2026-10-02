package emailtemplate

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
	"text/template"
)

func TestReadablePaymentLogKeepsOtherLines(t *testing.T) {
	_, source, _, _ := runtime.Caller(0)
	data, err := os.ReadFile(filepath.Join(filepath.Dir(source), "..", "..", "grafana", "dashboards", "reserve-logs.json"))
	if err != nil {
		t.Fatal(err)
	}
	var dashboard struct {
		Panels []struct {
			ID     int `json:"id"`
			Panels []struct {
				ID      int `json:"id"`
				Targets []struct {
					Expr string `json:"expr"`
				} `json:"targets"`
			} `json:"panels"`
		} `json:"panels"`
	}
	if err := json.Unmarshal(data, &dashboard); err != nil {
		t.Fatal(err)
	}
	var expression string
	for _, row := range dashboard.Panels {
		for _, panel := range row.Panels {
			if panel.ID == 19 && len(panel.Targets) == 1 {
				expression = panel.Targets[0].Expr
			}
		}
	}
	parts := strings.Split(expression, " | line_format `")
	if len(parts) != 2 || !strings.HasSuffix(parts[1], "`") {
		t.Fatal("log panel formatter missing")
	}
	if parts[0] != `{job="reserve", level=~"$level"} |~ "$domain" |~ "$search"` {
		t.Fatal("source filters changed")
	}
	for _, test := range []struct{ line, expected string }{
		{"2026-10-01 ERROR Payment operations queue requires attention: openIssues=0, failedWebhooks=0, staleReadyPayments=0, ledgerInvariantViolations=0, depositInvariantViolations=2", "결제 기록을 확인해주세요 · 결제 대조 0건 / 결제 알림 처리 실패 0건 / 7일 넘게 결제 대기 0건 / 결제 기록 불일치 0건 / 예약금 표시 불일치 2건"},
		{"ERROR Payment operations queue requires attention: openIssues=12, failedWebhooks=3, staleReadyPayments=4, ledgerInvariantViolations=5, depositInvariantViolations=6", "결제 기록을 확인해주세요 · 결제 대조 12건 / 결제 알림 처리 실패 3건 / 7일 넘게 결제 대기 4건 / 결제 기록 불일치 5건 / 예약금 표시 불일치 6건"},
		{"INFO Reservation created", "INFO Reservation created"},
		{"ERROR Payment operations queue requires attention: unexpected format", "ERROR Payment operations queue requires attention: unexpected format"},
		{"ERROR Payment operations queue requires attention: openIssues=0, failedWebhooks=0, staleReadyPayments=0, ledgerInvariantViolations=0, depositInvariantViolations=2; extra detail", "ERROR Payment operations queue requires attention: openIssues=0, failedWebhooks=0, staleReadyPayments=0, ledgerInvariantViolations=0, depositInvariantViolations=2; extra detail"},
	} {
		functions := template.FuncMap{
			"__line__": func() string { return test.line },
			"regexReplaceAll": func(pattern, value, replacement string) (string, error) {
				compiled, err := regexp.Compile(pattern)
				if err != nil {
					return "", err
				}
				return compiled.ReplaceAllString(value, replacement), nil
			},
		}
		parsed, err := template.New("line").Funcs(functions).Parse(strings.TrimSuffix(parts[1], "`"))
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		if err := parsed.Execute(&out, nil); err != nil {
			t.Fatal(err)
		}
		if out.String() != test.expected {
			t.Errorf("got %q; want %q", out.String(), test.expected)
		}
	}
}
