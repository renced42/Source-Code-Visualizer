package hu.sourcegraph.explorer.util;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Component
public class ZipProjectExtractor {
    private static final Set<String> IGNORED_SEGMENTS = Set.of(
            ".git", ".idea", ".gradle", "node_modules", "target", "build", "dist", "out", "coverage");

    public Path extract(InputStream inputStream) throws IOException {
        Path root = Files.createTempDirectory("source-graph-");
        try (ZipInputStream zip = new ZipInputStream(inputStream)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory() || isIgnored(entry.getName())) {
                    continue;
                }
                Path target = root.resolve(entry.getName()).normalize();
                if (!target.startsWith(root)) {
                    throw new IOException("Érvénytelen ZIP bejegyzés: " + entry.getName());
                }
                Files.createDirectories(target.getParent());
                Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return root;
    }

    private boolean isIgnored(String name) {
        String normalized = name.replace('\\', '/');
        for (String part : normalized.split("/")) {
            if (IGNORED_SEGMENTS.contains(part)) {
                return true;
            }
        }
        return false;
    }
}
