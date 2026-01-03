package com.umeshsolanki.dockermanager

import com.github.dockerjava.api.async.ResultCallback
import com.pty4j.PtyProcess
import com.pty4j.PtyProcessBuilder
import com.pty4j.WinSize
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.send
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.ClosedReceiveChannelException
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale
import com.github.dockerjava.api.model.Frame as DockerFrame

object ShellService {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    suspend fun handleServerShell(session: DefaultWebSocketServerSession) {
        val os = System.getProperty("os.name").lowercase(Locale.ENGLISH)
        val shell = if (os.contains("win")) "cmd.exe" else "/bin/sh"
        val env = HashMap(System.getenv())
        env["TERM"] = "xterm-256color"

        val pty = PtyProcessBuilder().setCommand(arrayOf(shell)).setEnvironment(env)
            .setDirectory(System.getProperty("user.home")).start()

        handlePtySession(session, pty)
    }

    suspend fun handleContainerShell(session: DefaultWebSocketServerSession, containerId: String) {
        val dockerClient = DockerClientProvider.client

        // Ensure container is running
        val container = dockerClient.inspectContainerCmd(containerId).exec()
        if (!container.state.running!!) {
            session.send("Container is not running.\n")
            session.close()
            return
        }

        val execCreateCmd =
            dockerClient.execCreateCmd(containerId).withAttachStdout(true).withAttachStderr(true)
                .withAttachStdin(true).withTty(true)
                .withCmd("/bin/sh", "-c", "[ -x /bin/bash ] && exec /bin/bash || exec /bin/sh")
                .exec()

        val execId = execCreateCmd.id

        try {
            val callback = object : ResultCallback.Adapter<DockerFrame>() {
                override fun onNext(frame: DockerFrame) {
                    runBlocking {
                        try {
                            session.send(Frame.Binary(true, frame.payload))
                        } catch (e: Exception) {
                            // Session might be closed
                        }
                    }
                }
            }

            // Using attach to handle stdin/stdout bidirectionally
            // Note: execStartCmd with stdin is a bit quirky in docker-java
            // We'll use a wrapper to pipe session incoming to docker stdin

            val pipedInputStream = java.io.PipedInputStream()
            val pipedOutputStream = java.io.PipedOutputStream(pipedInputStream)

            val execJob = scope.launch(Dispatchers.IO) {
                dockerClient.execStartCmd(execId).withDetach(false).withTty(true)
                    .withStdIn(pipedInputStream).exec(callback).awaitCompletion()
            }

            try {
                for (frame in session.incoming) {
                    if (frame is Frame.Text || frame is Frame.Binary) {
                        val data = frame.data
                        val text = String(data)
                        if (text.startsWith("{\"type\":\"resize\"")) {
                            try {
                                val json = AppConfig.json.parseToJsonElement(text).jsonObject
                                val cols = json["cols"]?.jsonPrimitive?.int ?: 80
                                val rows = json["rows"]?.jsonPrimitive?.int ?: 24
                                dockerClient.resizeExecCmd(execId).withSize(rows, cols).exec()
                            } catch (e: Exception) {
                            }
                        } else {
                            pipedOutputStream.write(data)
                            pipedOutputStream.flush()
                        }
                    }
                }
            } finally {
                pipedOutputStream.close()
                pipedInputStream.close()
                execJob.cancel()
            }

        } catch (e: Exception) {
            e.printStackTrace()
            session.send("Error: ${e.message}\n")
        } finally {
            session.close()
        }
    }

    private suspend fun handlePtySession(session: DefaultWebSocketServerSession, pty: PtyProcess) {
        val inputStream = pty.inputStream
        val outputStream = pty.outputStream

        val readJob = scope.launch {
            val buffer = ByteArray(1024)
            try {
                while (isActive) {
                    val read = withContext(Dispatchers.IO) { inputStream.read(buffer) }
                    if (read == -1) break
                    if (read > 0) {
                        session.send(Frame.Binary(true, buffer.copyOf(read)))
                    }
                }
            } catch (e: Exception) {
                // Connection closed
            }
        }

        try {
            for (frame in session.incoming) {
                if (frame is Frame.Text || frame is Frame.Binary) {
                    val data = frame.data
                    val text = String(data)
                    if (text.startsWith("{\"type\":\"resize\"")) {
                        try {
                            val json = AppConfig.json.parseToJsonElement(text).jsonObject
                            val cols = json["cols"]?.jsonPrimitive?.int ?: 80
                            val rows = json["rows"]?.jsonPrimitive?.int ?: 24
                            pty.winSize = WinSize(cols, rows)
                        } catch (e: Exception) {
                        }
                    } else {
                        withContext(Dispatchers.IO) {
                            outputStream.write(data)
                            outputStream.flush()
                        }
                    }
                }
            }
        } catch (e: ClosedReceiveChannelException) {
            // WebSocket closed
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            readJob.cancel()
            pty.destroy()
        }
    }
}
