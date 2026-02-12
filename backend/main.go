package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Request from the React frontend
type CompletionRequest struct {
	// field, type, struct tag. The struct tag tells Go how to map this field when converting to/from JSON
	Model     string `json:"model"`
	Prompt    string `json:"prompt"`
	MaxTokens int    `json:"max_tokens"`
}

// Response back to the React frontend
type CompletionResponse struct {
	Choices []Choice `json:"choices"`
	Usage   Usage    `json:"usage"`
}

type Choice struct {
	Text string `json:"text"`
}

type Usage struct {
	CompletionTokens int `json:"completion_tokens"`
}

// Using Ollama as the inference engine. This is the request format that it uses.
// It exposes a local API on port 11434
type OllamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// Ollama API response format
// Not all of these fields are used but this is the full response format you get from Ollama
type OllamaResponse struct {
	Model         string `json:"model"`
	Response      string `json:"response"`
	Done          bool   `json:"done"`
	TotalDuration int64  `json:"total_duration"`
	EvalCount     int    `json:"eval_count"`
}

// ---------------------------------------------------------------------- //
// ---------------------------------------------------------------------- //
// ---------------------------------------------------------------------- //

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func handleCompletion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request from frontend
	var req CompletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Build Ollama request
	ollamaReq := OllamaRequest{
		Model:  req.Model,
		Prompt: req.Prompt,
		Stream: false,
	}

	ollamaBody, err := json.Marshal(ollamaReq)
	if err != nil {
		http.Error(w, "Failed to build request", http.StatusInternalServerError)
		return
	}

	// Send to Ollama
	// Starts timer for request to model. This is not for the latency metric which is calculated by the frontend it is for logging server side latency
	start := time.Now()
	resp, err := http.Post("http://localhost:11434/api/generate", "application/json", bytes.NewBuffer(ollamaBody))
	if err != nil {
		http.Error(w, fmt.Sprintf("Ollama error: %v", err), http.StatusBadGateway)
		return
	}

	// Do this later once the function finishes execution
	defer resp.Body.Close()

	// Read Ollama response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to read response", http.StatusInternalServerError)
		return
	}

	var ollamaResp OllamaResponse
	if err := json.Unmarshal(body, &ollamaResp); err != nil {
		http.Error(w, "Failed to parse Ollama response", http.StatusInternalServerError)
		return
	}

	// Ends timer and stores result in elapsed
	elapsed := time.Since(start)

	// Estimate tokens (rough: split by spaces)
	tokens := len(bytes.Fields([]byte(ollamaResp.Response)))

	// Build response for frontend
	response := CompletionResponse{
		Choices: []Choice{{Text: ollamaResp.Response}},
		Usage:   Usage{CompletionTokens: tokens},
	}

	log.Printf("Model: %s | Latency: %v | Tokens: %d", req.Model, elapsed, tokens)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/v1/completions", enableCORS(handleCompletion))

	fmt.Println("Backend running on http://localhost:8000")
	log.Fatal(http.ListenAndServe(":8000", nil))
}
