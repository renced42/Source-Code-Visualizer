package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Service
public class ProjectAnalyzer {
    private final List<SourceFileAnalyzer> analyzers;
    private final GraphRelationshipResolver relationshipResolver;

    public ProjectAnalyzer(List<SourceFileAnalyzer> analyzers, GraphRelationshipResolver relationshipResolver) {
        this.analyzers = analyzers;
        this.relationshipResolver = relationshipResolver;
    }

    public SourceGraph analyze(Path root) throws IOException {
        SourceGraph graph = new SourceGraph();
        try (var paths = Files.walk(root)) {
            paths.filter(Files::isRegularFile).forEach(path -> {
                String relative = root.relativize(path).toString().replace('\\', '/');
                graph.addNode(GraphSupport.fileNode(relative));
                analyzers.stream().filter(analyzer -> analyzer.supports(path)).findFirst().ifPresent(analyzer -> {
                    try {
                        analyzer.analyze(root, path, graph);
                    } catch (Exception ex) {
                        graph.addWarning(relative + ": " + ex.getMessage());
                    }
                });
            });
        }
        relationshipResolver.resolve(graph);
        return graph;
    }
}
