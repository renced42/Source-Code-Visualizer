package hu.sourcegraph.explorer.api;

import hu.sourcegraph.explorer.analysis.ProjectAnalyzer;
import hu.sourcegraph.explorer.model.SourceGraph;
import hu.sourcegraph.explorer.util.FileTreeCleaner;
import hu.sourcegraph.explorer.util.ZipProjectExtractor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/analysis")
public class AnalysisController {
    private final ZipProjectExtractor extractor;
    private final ProjectAnalyzer analyzer;
    private final AnalysisSessionStore sessionStore;

    public AnalysisController(ZipProjectExtractor extractor, ProjectAnalyzer analyzer, AnalysisSessionStore sessionStore) {
        this.extractor = extractor;
        this.analyzer = analyzer;
        this.sessionStore = sessionStore;
    }

    @PostMapping(path = "/zip", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SourceGraph analyzeZip(@RequestPart("file") MultipartFile file) throws IOException {
        if (file.isEmpty() || file.getOriginalFilename() == null || !file.getOriginalFilename().toLowerCase().endsWith(".zip")) {
            throw new IllegalArgumentException("ZIP állomány feltöltése szükséges.");
        }
        Path root = null;
        boolean retained = false;
        try {
            root = extractor.extract(file.getInputStream());
            SourceGraph graph = analyzer.analyze(root);
            graph.setAnalysisId(sessionStore.replace(root, graph));
            retained = true;
            return graph;
        } finally {
            if (!retained) FileTreeCleaner.deleteRecursively(root);
        }
    }

    @GetMapping(path = "/{analysisId}/source", produces = MediaType.APPLICATION_JSON_VALUE)
    public AnalysisSessionStore.SourceViewResponse source(
            @PathVariable String analysisId,
            @RequestParam String path) throws IOException {
        return sessionStore.readSource(analysisId, path);
    }
}
