package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Set;

@Component
@Order(1000)
public class GenericTextAnalyzer implements SourceFileAnalyzer {
    private static final Set<String> EXTENSIONS = Set.of("xml", "json", "yaml", "yml", "properties", "sql", "md", "gradle");

    @Override
    public boolean supports(Path path) {
        String name = path.getFileName().toString();
        return name.equals("pom.xml") || EXTENSIONS.contains(GraphSupport.extension(name));
    }

    @Override
    public void analyze(Path root, Path path, SourceGraph graph) {
        // The file node is already created. Structured config analysis is a later extension point.
    }
}
