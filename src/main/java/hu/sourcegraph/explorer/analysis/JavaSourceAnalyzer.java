package hu.sourcegraph.explorer.analysis;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.Problem;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
@Order(10)
public class JavaSourceAnalyzer implements SourceFileAnalyzer {
    private final JavaLanguageLevelDetector languageLevelDetector;

    public JavaSourceAnalyzer(JavaLanguageLevelDetector languageLevelDetector) {
        this.languageLevelDetector = languageLevelDetector;
    }

    @Override
    public boolean supports(Path path) {
        return path.getFileName().toString().endsWith(".java");
    }

    @Override
    public void analyze(Path root, Path path, SourceGraph graph) throws Exception {
        String relative = root.relativize(path).toString().replace('\\', '/');
        String fileId = GraphSupport.fileId(relative);
        var detected = languageLevelDetector.detect(root, path);
        ParserConfiguration configuration = new ParserConfiguration().setLanguageLevel(detected.languageLevel());
        ParseResult<CompilationUnit> parseResult = new JavaParser(configuration).parse(path);
        if (parseResult.getResult().isEmpty()) {
            String problems = parseResult.getProblems().stream().map(Problem::getVerboseMessage)
                    .reduce((left, right) -> left + "; " + right).orElse("Ismeretlen Java parser hiba");
            throw new IllegalArgumentException(problems);
        }
        CompilationUnit unit = parseResult.getResult().orElseThrow();
        parseResult.getProblems().forEach(problem -> graph.addWarning(relative + ": " + problem.getVerboseMessage()));
        String packageName = unit.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
        Map<String, String> imports = new LinkedHashMap<>();

        unit.getImports().forEach(importDecl -> {
            String imported = importDecl.getNameAsString();
            imports.put(simpleName(imported), imported);
            String target = "java-type:" + imported;
            graph.addNode(GraphSupport.node(target, "JAVA_TYPE_REFERENCE", imported, relative,
                    importDecl.getBegin().map(p -> p.line).orElse(null), Map.of("qualifiedName", imported)));
            graph.addEdge(GraphSupport.edge(fileId, target, "IMPORTS", "EXACT", importDecl.toString().trim()));
        });

        for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
            String qualified = packageName.isBlank() ? type.getNameAsString() : packageName + "." + type.getNameAsString();
            String typeId = "java-type:" + qualified;
            String role = detectRole(type);
            String detectedType = isApplicationEntry(type) ? "JAVA_APPLICATION_ENTRY" : role;
            graph.addNode(GraphSupport.node(typeId, detectedType, type.getNameAsString(), relative,
                    type.getBegin().map(p -> p.line).orElse(null), Map.of(
                            "qualifiedName", qualified,
                            "simpleName", type.getNameAsString(),
                            "role", role)));
            graph.addEdge(GraphSupport.edge(fileId, typeId, "DECLARES", "EXACT", "Java type"));

            if (type.isClassOrInterfaceDeclaration()) {
                var declaration = type.asClassOrInterfaceDeclaration();
                declaration.getExtendedTypes().forEach(parent -> {
                    addTypeEdge(graph, typeId, resolveType(parent.getNameWithScope(), packageName, imports), "EXTENDS", relative);
                    parent.getTypeArguments().ifPresent(args -> args.forEach(arg -> {
                        if (role.equals("JAVA_REPOSITORY")) {
                            String entity = resolveType(arg.asString(), packageName, imports);
                            addTypeEdge(graph, typeId, entity, "USES_ENTITY", relative);
                        }
                    }));
                });
                declaration.getImplementedTypes().forEach(parent ->
                        addTypeEdge(graph, typeId, resolveType(parent.getNameWithScope(), packageName, imports), "IMPLEMENTS", relative));
            }

            for (FieldDeclaration field : type.getFields()) {
                field.getVariables().forEach(variable -> {
                    String fieldName = variable.getNameAsString();
                    String targetType = resolveType(variable.getType().asString(), packageName, imports);
                    String targetId = "java-type:" + targetType;
                    graph.addNode(GraphSupport.node(targetId, "JAVA_TYPE_REFERENCE", simpleName(targetType), relative,
                            field.getBegin().map(p -> p.line).orElse(null), Map.of("qualifiedName", targetType)));
                    graph.addEdge(GraphSupport.edge(typeId, targetId, "INJECTS", "INFERRED", fieldName));
                });
            }
        }

        for (CallableDeclaration<?> callable : unit.findAll(CallableDeclaration.class)) {
            Optional<TypeDeclaration<?>> ownerOpt = findOwningType(callable);
            String ownerSimple = ownerOpt.map(TypeDeclaration::getNameAsString).orElse("<unknown>");
            String ownerQualified = packageName.isBlank() ? ownerSimple : packageName + "." + ownerSimple;
            String ownerId = "java-type:" + ownerQualified;
            String callableId = "java-callable:" + ownerQualified + "#" + callable.getSignature().asString();
            graph.addNode(GraphSupport.node(callableId,
                    callable.isConstructorDeclaration() ? "JAVA_CONSTRUCTOR" : "JAVA_METHOD",
                    callable.getNameAsString(), relative, callable.getBegin().map(p -> p.line).orElse(null), Map.of(
                            "ownerQualified", ownerQualified,
                            "methodName", callable.getNameAsString(),
                            "signature", callable.getSignature().asString())));
            graph.addEdge(GraphSupport.edge(ownerId, callableId, "DECLARES", "EXACT", callable.getSignature().asString()));

            if (callable instanceof MethodDeclaration method) {
                endpointPath(method, ownerOpt.orElse(null)).ifPresent(endpoint -> {
                    String endpointId = "rest-endpoint:" + normalizeEndpoint(endpoint);
                    graph.addNode(GraphSupport.node(endpointId, "REST_ENDPOINT", endpoint, relative,
                            method.getBegin().map(p -> p.line).orElse(null), Map.of("path", normalizeEndpoint(endpoint))));
                    graph.addEdge(GraphSupport.edge(endpointId, callableId, "EXPOSED_BY", "EXACT", endpoint));
                });
            }

            callable.findAll(MethodCallExpr.class).forEach(call -> {
                String scope = call.getScope().map(Object::toString).orElse("");
                String target = "java-call-ref:" + callableId + "@" + call.getBegin().map(p -> p.line).orElse(0) + ":" + call.getNameAsString();
                graph.addNode(GraphSupport.node(target, "JAVA_CALL_REFERENCE", call.getNameAsString(), relative,
                        call.getBegin().map(p -> p.line).orElse(null), Map.of(
                                "scope", scope,
                                "methodName", call.getNameAsString(),
                                "ownerQualified", ownerQualified)));
                graph.addEdge(GraphSupport.edge(callableId, target, "CALLS", "INFERRED", call.toString()));
            });
            callable.findAll(ObjectCreationExpr.class).forEach(create -> {
                String resolved = resolveType(create.getType().getNameWithScope(), packageName, imports);
                String target = "java-type:" + resolved;
                graph.addNode(GraphSupport.node(target, "JAVA_TYPE_REFERENCE", simpleName(resolved), relative,
                        create.getBegin().map(p -> p.line).orElse(null), Map.of("qualifiedName", resolved)));
                graph.addEdge(GraphSupport.edge(callableId, target, "CREATES", "INFERRED", create.toString()));
            });
        }
    }

    private Optional<TypeDeclaration<?>> findOwningType(CallableDeclaration<?> callable) {
        return callable.findAncestor(TypeDeclaration.class)
                .map(type -> (TypeDeclaration<?>) type);
    }

    private Optional<String> endpointPath(MethodDeclaration method, TypeDeclaration<?> owner) {
        String classPath = owner == null ? "" : mappingPath(owner.getAnnotations()).orElse("");
        Optional<String> methodPath = mappingPath(method.getAnnotations());
        if (methodPath.isEmpty()) return Optional.empty();
        return Optional.of(joinPaths(classPath, methodPath.orElse("")));
    }

    private Optional<String> mappingPath(Iterable<AnnotationExpr> annotations) {
        for (AnnotationExpr annotation : annotations) {
            String name = annotation.getNameAsString();
            if (!(name.equals("RequestMapping") || name.endsWith("Mapping"))) continue;
            if (annotation.isSingleMemberAnnotationExpr()) {
                var value = annotation.asSingleMemberAnnotationExpr().getMemberValue();
                if (value.isStringLiteralExpr()) return Optional.of(value.asStringLiteralExpr().asString());
            }
            if (annotation.isNormalAnnotationExpr()) {
                for (var pair : annotation.asNormalAnnotationExpr().getPairs()) {
                    if ((pair.getNameAsString().equals("value") || pair.getNameAsString().equals("path"))) {
                        if (pair.getValue().isStringLiteralExpr()) return Optional.of(pair.getValue().asStringLiteralExpr().asString());
                        if (pair.getValue().isArrayInitializerExpr()) {
                            return pair.getValue().asArrayInitializerExpr().getValues().stream()
                                    .filter(v -> v instanceof StringLiteralExpr).map(v -> ((StringLiteralExpr) v).asString()).findFirst();
                        }
                    }
                }
            }
            return Optional.of("");
        }
        return Optional.empty();
    }

    private String joinPaths(String left, String right) {
        String value = ("/" + left + "/" + right).replaceAll("/+", "/");
        return value.length() > 1 && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String normalizeEndpoint(String endpoint) {
        String value = endpoint == null || endpoint.isBlank() ? "/" : endpoint.trim();
        int query = value.indexOf('?');
        if (query >= 0) value = value.substring(0, query);
        if (!value.startsWith("/")) value = "/" + value;
        return value.replaceAll("/+", "/");
    }

    private boolean isApplicationEntry(TypeDeclaration<?> type) {
        boolean springBootApplication = type.getAnnotations().stream()
                .anyMatch(annotation -> annotation.getNameAsString().equals("SpringBootApplication"));
        boolean mainMethod = type.getMethods().stream().anyMatch(this::isMainMethod);
        return springBootApplication || mainMethod;
    }

    private boolean isMainMethod(MethodDeclaration method) {
        return method.getNameAsString().equals("main") && method.isStatic() && method.getType().isVoidType()
                && method.getParameters().size() == 1;
    }

    private String detectRole(TypeDeclaration<?> type) {
        String annotations = type.getAnnotations().stream().map(a -> a.getNameAsString().toLowerCase(Locale.ROOT))
                .reduce("", (a, b) -> a + " " + b);
        if (annotations.contains("restcontroller") || annotations.contains("controller")) return "JAVA_CONTROLLER";
        if (annotations.contains("service")) return "JAVA_SERVICE";
        if (annotations.contains("repository")) return "JAVA_REPOSITORY";
        if (annotations.contains("entity") || annotations.contains("table")) return "JAVA_ENTITY";
        return javaType(type);
    }

    private void addTypeEdge(SourceGraph graph, String source, String qualifiedName, String type, String relative) {
        String target = "java-type:" + qualifiedName;
        graph.addNode(GraphSupport.node(target, "JAVA_TYPE_REFERENCE", simpleName(qualifiedName), relative, null,
                Map.of("qualifiedName", qualifiedName)));
        graph.addEdge(GraphSupport.edge(source, target, type, "INFERRED", qualifiedName));
    }

    private String resolveType(String raw, String packageName, Map<String, String> imports) {
        String clean = raw.replaceAll("<.*>", "").replace("[]", "").trim();
        if (clean.contains(".")) return clean;
        if (imports.containsKey(clean)) return imports.get(clean);
        if (clean.startsWith("java.lang.")) return clean;
        return packageName.isBlank() ? clean : packageName + "." + clean;
    }

    private String simpleName(String qualified) {
        int dot = qualified.lastIndexOf('.');
        return dot >= 0 ? qualified.substring(dot + 1) : qualified;
    }

    private String javaType(TypeDeclaration<?> type) {
        if (type.isAnnotationDeclaration()) return "JAVA_ANNOTATION";
        if (type.isEnumDeclaration()) return "JAVA_ENUM";
        if (type.isRecordDeclaration()) return "JAVA_RECORD";
        if (type.isClassOrInterfaceDeclaration() && type.asClassOrInterfaceDeclaration().isInterface()) return "JAVA_INTERFACE";
        return "JAVA_CLASS";
    }
}
