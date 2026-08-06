package hu.sourcegraph.explorer.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.Set;

@Component
public class OllamaClient {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI baseUri;
    private final String defaultModel;
    private final int contextSize;
    private final double temperature;
    private final Map<String, CompletableFuture<HttpResponse<String>>> activeGenerations = new ConcurrentHashMap<>();
    private final Set<String> cancelledGenerations = ConcurrentHashMap.newKeySet();

    public OllamaClient(
            ObjectMapper objectMapper,
            @Value("${app.ai.ollama.base-url:http://127.0.0.1:11434}") String baseUrl,
            @Value("${app.ai.ollama.model:qwen2.5-coder-local:7b}") String defaultModel,
            @Value("${app.ai.ollama.context-size:16384}") int contextSize,
            @Value("${app.ai.ollama.temperature:0.15}") double temperature) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        this.baseUri = validateLoopbackBaseUrl(baseUrl);
        this.defaultModel = defaultModel;
        this.contextSize = Math.max(2048, Math.min(contextSize, 131072));
        this.temperature = Math.max(0.0, Math.min(temperature, 1.0));
    }

    public Status status() {
        try {
            List<ModelInfo> models = listModels();
            boolean defaultAvailable = models.stream().anyMatch(model -> model.name().equals(defaultModel));
            return new Status(true, baseUri.toString(), defaultModel, defaultAvailable, models, null);
        } catch (Exception exception) {
            return new Status(false, baseUri.toString(), defaultModel, false, List.of(), safeMessage(exception));
        }
    }

    public List<ModelInfo> listModels() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(baseUri.resolve("/api/tags"))
                .timeout(Duration.ofSeconds(8))
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        requireSuccess(response, "Az Ollama modell-lista nem kérdezhető le.");
        JsonNode root = objectMapper.readTree(response.body());
        List<ModelInfo> result = new ArrayList<>();
        for (JsonNode model : root.path("models")) {
            JsonNode details = model.path("details");
            result.add(new ModelInfo(
                    model.path("name").asText(),
                    model.path("size").asLong(0),
                    details.path("parameter_size").asText(""),
                    details.path("quantization_level").asText(""),
                    details.path("family").asText("")));
        }
        return result;
    }


    public List<float[]> embed(String model, List<String> inputs) throws IOException, InterruptedException {
        if (inputs == null || inputs.isEmpty()) return List.of();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("input", inputs);
        String requestJson = objectMapper.writeValueAsString(body);
        HttpRequest request = HttpRequest.newBuilder(baseUri.resolve("/api/embed"))
                .timeout(Duration.ofMinutes(4))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        requireSuccess(response, "Az Ollama nem tudott embeddinget készíteni.");
        JsonNode root = objectMapper.readTree(response.body());
        List<float[]> result = new ArrayList<>();
        for (JsonNode embedding : root.path("embeddings")) {
            float[] vector = new float[embedding.size()];
            for (int i = 0; i < embedding.size(); i++) vector[i] = (float) embedding.get(i).asDouble();
            result.add(vector);
        }
        return result;
    }

    public GenerateResult generate(String requestId, String model, String systemPrompt, String prompt) throws IOException, InterruptedException {
        if (requestId != null && cancelledGenerations.remove(requestId)) {
            throw new InterruptedException("A válasz generálását a felhasználó leállította.");
        }
        String selectedModel = model == null || model.isBlank() ? defaultModel : model.trim();
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("temperature", temperature);
        options.put("num_ctx", contextSize);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", selectedModel);
        body.put("system", systemPrompt);
        body.put("prompt", prompt);
        body.put("stream", false);
        body.put("options", options);
        String requestJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(body);
        URI endpoint = baseUri.resolve("/api/generate");
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofMinutes(8))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                .build();
        long started = System.nanoTime();
        CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        if (requestId != null && !requestId.isBlank()) {
            activeGenerations.put(requestId, future);
            if (cancelledGenerations.remove(requestId)) future.cancel(true);
        }
        HttpResponse<String> response;
        try {
            response = future.get();
        } catch (CancellationException exception) {
            throw new InterruptedException("A válasz generálását a felhasználó leállította.");
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof IOException ioException) throw ioException;
            if (cause instanceof InterruptedException interruptedException) throw interruptedException;
            throw new IOException("Az Ollama kérés sikertelen.", cause);
        } finally {
            if (requestId != null && !requestId.isBlank()) activeGenerations.remove(requestId, future);
        }
        long roundTripNanos = System.nanoTime() - started;
        requireSuccess(response, "Az Ollama nem tudta feldolgozni a kérdést.");
        JsonNode root = objectMapper.readTree(response.body());
        String formattedResponse = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        CommunicationTrace trace = new CommunicationTrace(
                endpoint.toString(),
                "POST",
                "application/json",
                response.statusCode(),
                requestJson,
                formattedResponse,
                systemPrompt.length(),
                prompt.length(),
                requestJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                response.body().getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                contextSize,
                temperature,
                roundTripNanos);
        return new GenerateResult(
                selectedModel,
                root.path("response").asText(""),
                root.path("total_duration").asLong(0),
                root.path("load_duration").asLong(0),
                root.path("prompt_eval_duration").asLong(0),
                root.path("eval_duration").asLong(0),
                root.path("prompt_eval_count").asInt(0),
                root.path("eval_count").asInt(0),
                trace);
    }


    public boolean cancelGenerate(String requestId) {
        if (requestId == null || requestId.isBlank()) return false;
        CompletableFuture<HttpResponse<String>> future = activeGenerations.remove(requestId);
        if (future != null) return future.cancel(true);
        cancelledGenerations.add(requestId);
        return true;
    }

    private static URI validateLoopbackBaseUrl(String value) {
        URI uri = URI.create(value == null ? "" : value.trim());
        String host = uri.getHost();
        String scheme = uri.getScheme();
        boolean allowedScheme = "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        boolean loopback = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host);
        if (!allowedScheme || !loopback || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("Az Ollama címe kizárólag helyi loopback cím lehet.");
        }
        String normalized = uri.toString();
        if (!normalized.endsWith("/")) normalized += "/";
        return URI.create(normalized);
    }

    private static void requireSuccess(HttpResponse<String> response, String message) {
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException(message + " HTTP " + response.statusCode());
        }
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }

    public record ModelInfo(String name, long size, String parameterSize, String quantization, String family) {}
    public record Status(boolean available, String baseUrl, String defaultModel, boolean defaultModelAvailable,
                         List<ModelInfo> models, String error) {}
    public record CommunicationTrace(String endpoint, String method, String contentType, int httpStatus,
                                     String requestJson, String responseJson, int systemPromptCharacters,
                                     int projectPromptCharacters, int requestBytes, int responseBytes,
                                     int contextSize, double temperature, long roundTripNanos) {}
    public record GenerateResult(String model, String response, long totalDurationNanos,
                                 long loadDurationNanos, long promptEvalDurationNanos, long evalDurationNanos,
                                 int promptTokens, int responseTokens, CommunicationTrace trace) {}
}
