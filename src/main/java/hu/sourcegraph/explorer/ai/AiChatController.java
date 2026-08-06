package hu.sourcegraph.explorer.ai;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiChatController {
    private static final String SYSTEM_PROMPT = """
            Te a Source Graph Explorer helyi, csak olvasási kódelemző asszisztense vagy.
            Kizárólag a kapott projektgráf és forráskód alapján válaszolj, magyarul.
            Ne találj ki nem létező fájlt, osztályt, metódust vagy kapcsolatot.
            A bizonyított állításokat [MEGERŐSÍTETT], a valószínű következtetéseket [KÖVETKEZTETETT],
            a hiányzó információt [NEM FELOLDHATÓ] jelöléssel lásd el.
            Fájlra hivatkozáskor használd ezt a formátumot: `útvonal: sor`.
            A válasz legyen strukturált Markdown, rövid összefoglalóval és érintett fájlokkal.
            Nem módosíthatsz fájlt, nem futtathatsz parancsot, és nem kérhetsz külső hálózati adatot.
            """;

    private final OllamaClient ollamaClient;
    private final ProjectKnowledgeService knowledgeService;
    private final VectorKnowledgeIndexService vectorIndexService;

    public AiChatController(OllamaClient ollamaClient, ProjectKnowledgeService knowledgeService,
                            VectorKnowledgeIndexService vectorIndexService) {
        this.ollamaClient = ollamaClient;
        this.knowledgeService = knowledgeService;
        this.vectorIndexService = vectorIndexService;
    }

    @GetMapping("/status")
    public OllamaClient.Status status() {
        return ollamaClient.status();
    }


    @GetMapping("/index/status")
    public VectorKnowledgeIndexService.IndexStatus indexStatus(@RequestParam String analysisId) {
        return vectorIndexService.status(analysisId);
    }

    @PostMapping("/index")
    public VectorKnowledgeIndexService.IndexStatus buildIndex(@RequestBody IndexRequest request) throws IOException, InterruptedException {
        if (request.analysisId() == null || request.analysisId().isBlank()) {
            throw new IllegalArgumentException("Először elemezz egy projektet.");
        }
        return vectorIndexService.build(request.analysisId());
    }

    @PostMapping("/index/cancel")
    public VectorKnowledgeIndexService.IndexStatus cancelIndex(@RequestBody IndexRequest request) {
        if (request.analysisId() == null || request.analysisId().isBlank()) {
            throw new IllegalArgumentException("Először elemezz egy projektet.");
        }
        return vectorIndexService.cancel(request.analysisId());
    }

    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) throws IOException, InterruptedException {
        long requestStarted = System.nanoTime();
        if (request.analysisId() == null || request.analysisId().isBlank()) {
            throw new IllegalArgumentException("Először elemezz egy projektet.");
        }
        if (request.question() == null || request.question().isBlank()) {
            throw new IllegalArgumentException("A kérdés nem lehet üres.");
        }
        if (request.question().length() > 8000) {
            throw new IllegalArgumentException("A kérdés túl hosszú (maximum 8000 karakter).");
        }
        ProjectKnowledgeService.ContextResult context = knowledgeService.buildContext(
                request.analysisId(), request.question(), request.selectedNodeId());
        long promptStarted = System.nanoTime();
        String prompt = "FELHASZNÁLÓI KÉRDÉS:\n" + request.question().trim() + "\n\n" + context.context();
        long promptAssemblyDurationNanos = System.nanoTime() - promptStarted;
        OllamaClient.GenerateResult result = ollamaClient.generate(request.requestId(), request.model(), SYSTEM_PROMPT, prompt);
        long serverTotalDurationNanos = System.nanoTime() - requestStarted;
        ChatTrace trace = new ChatTrace(
                "Kérdés fogadva → gráfkontextus kiválasztva → forrásrészletek beolvasva → helyi Ollama meghívva → válasz feldolgozva",
                context.totalDurationNanos(),
                context.context().length(), context.vectorIndexUsed(), context.embeddingModel(),
                context.vectorHits(), context.vectorSearchDurationNanos(),
                context.graphLoadDurationNanos(), context.selectionDurationNanos(),
                context.graphSerializationDurationNanos(), context.sourceReadDurationNanos(),
                context.sourceFileCount(), promptAssemblyDurationNanos, serverTotalDurationNanos,
                result.loadDurationNanos(), result.promptEvalDurationNanos(), result.evalDurationNanos(),
                result.trace());
        return new ChatResponse(result.model(), result.response(), context.nodeCount(), context.edgeCount(),
                context.references(), result.totalDurationNanos(), result.promptTokens(), result.responseTokens(), trace);
    }

    public record IndexRequest(String analysisId) {}
    @PostMapping("/chat/cancel")
    public CancelChatResponse cancelChat(@RequestBody CancelChatRequest request) {
        boolean cancelled = ollamaClient.cancelGenerate(request.requestId());
        return new CancelChatResponse(cancelled);
    }

    public record ChatRequest(String analysisId, String model, String question, String selectedNodeId, String requestId) {}
    public record CancelChatRequest(String requestId) {}
    public record CancelChatResponse(boolean cancelled) {}
    public record ChatTrace(String pipeline, long contextBuildDurationNanos, int contextCharacters,
                            boolean vectorIndexUsed, String embeddingModel,
                            List<VectorKnowledgeIndexService.VectorHit> vectorHits, long vectorSearchDurationNanos,
                            long graphLoadDurationNanos, long selectionDurationNanos,
                            long graphSerializationDurationNanos, long sourceReadDurationNanos,
                            int sourceFileCount, long promptAssemblyDurationNanos, long serverTotalDurationNanos,
                            long ollamaLoadDurationNanos, long ollamaPromptEvalDurationNanos,
                            long ollamaEvalDurationNanos, OllamaClient.CommunicationTrace ollama) {}
    public record ChatResponse(String model, String answer, int contextNodeCount, int contextEdgeCount,
                               List<ProjectKnowledgeService.SourceReference> references,
                               long totalDurationNanos, int promptTokens, int responseTokens, ChatTrace trace) {}
}
