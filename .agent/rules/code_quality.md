# Code Quality Rules

1. **Imports over Fully Qualified Names (FQN)**
   - **Rule**: Always use imports for classes instead of inline fully qualified names (e.g., use `import com.example.MyClass` and then `MyClass`, effectively prohibiting `com.example.MyClass` in the code body).
   - **Exception**: FQNs are permitted only when strictly necessary to resolve name collisions (e.g., two classes with the same name from different packages).

2. **Serialization Best Practices**
   - **Rule**: Avoid using `Any` in data structures intended for JSON serialization (e.g., `Map<String, Any>`).
   - **Reason**: The serializer cannot determine the type at runtime easily.
   - **Action**: Use concrete types (e.g., `Map<String, String>`, `Map<String, Int>`) or explicitly marked `@Serializable` sealed classes/interfaces.

3. **Error Handling & Observability**
   - **Rule**: When catching exceptions in API routes or critical background tasks, always capture and log the full stack trace, or include it in the error response (in dev/admin contexts).
   - **Forbidden**: `catch (e: Exception) { println(e.message) }` is forbidden. Use a logger and log the exception object: `logger.error("Message", e)`.

4. **Resource Management**
   - **Rule**: Explicitly close resources (Database connections, InputStreams, File handles) when they are being replaced or no longer needed.
   - **Pattern**: Use `.use { }` for streams or explicit `.close()` calls in `finally` blocks or lifecycle management methods.

5. **Function/Class Organization**
   - **Rule**: Keep files focused. If a file grows beyond 300-400 lines, consider refactoring or splitting it.
   - **Rule**: Group related extension functions or utility classes in appropriate packages rather than large "Utils" files.

6. **Don't Repeat Yourself (DRY)**
   - **Rule**: Avoid duplicating logic or methods across multiple files.
   - **Action**: Extract duplicated logic (e.g., helper functions like password generation, string manipulation) into a shared utility object or helper class in the `utils` package.
   - **Example**: Instead of defining `generateSecurePassword` in multiple route files, create a `StringUtils` object and define it once there.
