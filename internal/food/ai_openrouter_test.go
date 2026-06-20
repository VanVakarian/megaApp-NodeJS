package food

import "testing"

func TestParseAIProductResponseAcceptsMarkdownJSON(t *testing.T) {
	result, err := parseAIProductResponse("```json\n{\n  \"generalizedName\": \"Говно на палочке\",\n  \"kcals\": 123,\n  \"protein\": 4.5,\n  \"fat\": 6.7,\n  \"carbs\": 8.9,\n  \"fiber\": 1.2,\n  \"description\": \"Тестовый продукт\"\n}\n```")
	if err != nil {
		t.Fatalf("parseAIProductResponse() error = %v", err)
	}
	if result.GeneralizedName != "Говно на палочке" || result.Kcals != 123 {
		t.Fatalf("result = %+v", result)
	}
}

func TestParseAIProductResponseRejectsIncompleteData(t *testing.T) {
	_, err := parseAIProductResponse(`{"generalizedName":"Продукт"}`)
	if err == nil {
		t.Fatal("parseAIProductResponse() error = nil, want error")
	}
}
