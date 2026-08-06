package hu.sourcegraph.explorer.analysis;

import com.github.javaparser.ParserConfiguration;
import org.springframework.stereotype.Component;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class JavaLanguageLevelDetector {
    private static final Pattern GRADLE_LANGUAGE_VERSION = Pattern.compile("JavaLanguageVersion\\.of\\s*\\(\\s*(\\d+)\\s*\\)");
    private static final Pattern GRADLE_COMPATIBILITY = Pattern.compile(
            "(?:sourceCompatibility|targetCompatibility)\\s*=\\s*(?:JavaVersion\\.VERSION_)?(?:['\"])?(?:1[._])?(\\d+)(?:['\"])?");

    public DetectedLanguageLevel detect(Path projectRoot, Path sourceFile) {
        for (Path directory : ancestorsUntil(sourceFile.getParent(), projectRoot)) {
            Optional<Integer> maven = detectMaven(directory.resolve("pom.xml"));
            if (maven.isPresent()) return result(maven.get(), directory.resolve("pom.xml"));

            for (String gradleName : List.of("build.gradle", "build.gradle.kts")) {
                Path gradle = directory.resolve(gradleName);
                Optional<Integer> version = detectGradle(gradle);
                if (version.isPresent()) return result(version.get(), gradle);
            }
        }
        return new DetectedLanguageLevel(ParserConfiguration.LanguageLevel.BLEEDING_EDGE, null, null);
    }

    private List<Path> ancestorsUntil(Path start, Path root) {
        List<Path> result = new ArrayList<>();
        Path normalizedRoot = root.toAbsolutePath().normalize();
        Path current = start.toAbsolutePath().normalize();
        while (current != null && current.startsWith(normalizedRoot)) {
            result.add(current);
            if (current.equals(normalizedRoot)) break;
            current = current.getParent();
        }
        return result;
    }

    private Optional<Integer> detectMaven(Path pom) {
        if (!Files.isRegularFile(pom)) return Optional.empty();
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setExpandEntityReferences(false);
            var document = factory.newDocumentBuilder().parse(pom.toFile());

            for (String tag : List.of("maven.compiler.release", "maven.compiler.source", "java.version", "release", "source")) {
                var nodes = document.getElementsByTagName(tag);
                for (int i = 0; i < nodes.getLength(); i++) {
                    Optional<Integer> parsed = parseVersion(nodes.item(i).getTextContent());
                    if (parsed.isPresent()) return parsed;
                }
            }
        } catch (Exception ignored) {
            // Invalid or unusual POM: fall through to safe modern parser level.
        }
        return Optional.empty();
    }

    private Optional<Integer> detectGradle(Path buildFile) {
        if (!Files.isRegularFile(buildFile)) return Optional.empty();
        try {
            String content = Files.readString(buildFile);
            Matcher languageVersion = GRADLE_LANGUAGE_VERSION.matcher(content);
            if (languageVersion.find()) return Optional.of(Integer.parseInt(languageVersion.group(1)));
            Matcher compatibility = GRADLE_COMPATIBILITY.matcher(content);
            if (compatibility.find()) return Optional.of(Integer.parseInt(compatibility.group(1)));
        } catch (IOException | NumberFormatException ignored) {
            // Fall through to safe modern parser level.
        }
        return Optional.empty();
    }

    private Optional<Integer> parseVersion(String raw) {
        if (raw == null) return Optional.empty();
        String value = raw.trim();
        if (value.startsWith("${") || value.isBlank()) return Optional.empty();
        if (value.startsWith("1.")) value = value.substring(2);
        Matcher matcher = Pattern.compile("^(\\d+)").matcher(value);
        return matcher.find() ? Optional.of(Integer.parseInt(matcher.group(1))) : Optional.empty();
    }

    private DetectedLanguageLevel result(int javaVersion, Path source) {
        return new DetectedLanguageLevel(toLanguageLevel(javaVersion), javaVersion, source);
    }

    private ParserConfiguration.LanguageLevel toLanguageLevel(int version) {
        return switch (version) {
            case 8 -> ParserConfiguration.LanguageLevel.JAVA_8;
            case 9 -> ParserConfiguration.LanguageLevel.JAVA_9;
            case 10 -> ParserConfiguration.LanguageLevel.JAVA_10;
            case 11 -> ParserConfiguration.LanguageLevel.JAVA_11;
            case 12 -> ParserConfiguration.LanguageLevel.JAVA_12;
            case 13 -> ParserConfiguration.LanguageLevel.JAVA_13;
            case 14 -> ParserConfiguration.LanguageLevel.JAVA_14;
            case 15 -> ParserConfiguration.LanguageLevel.JAVA_15;
            case 16 -> ParserConfiguration.LanguageLevel.JAVA_16;
            case 17 -> ParserConfiguration.LanguageLevel.JAVA_17;
            case 18 -> ParserConfiguration.LanguageLevel.JAVA_18;
            case 19 -> ParserConfiguration.LanguageLevel.JAVA_19;
            case 20 -> ParserConfiguration.LanguageLevel.JAVA_20;
            case 21 -> ParserConfiguration.LanguageLevel.JAVA_21;
            default -> ParserConfiguration.LanguageLevel.BLEEDING_EDGE;
        };
    }

    public record DetectedLanguageLevel(
            ParserConfiguration.LanguageLevel languageLevel,
            Integer javaVersion,
            Path configurationFile) {
    }
}
