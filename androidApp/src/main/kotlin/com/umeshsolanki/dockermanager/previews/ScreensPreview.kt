import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.umeshsolanki.dockermanager.App
import com.umeshsolanki.dockermanager.BatteryStatus
import com.umeshsolanki.dockermanager.ComposeFile
import com.umeshsolanki.dockermanager.DockerContainer
import com.umeshsolanki.dockermanager.DockerImage
import com.umeshsolanki.dockermanager.screens.ComposeContent
import com.umeshsolanki.dockermanager.screens.ContainersContent
import com.umeshsolanki.dockermanager.screens.ImagesContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Preview(showBackground = true)
@Composable
fun MainAppPreview() {
    App()
}

@Preview(showBackground = true)
@Composable
fun ContainersPreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ContainersContent(
                containers = listOf(
                    DockerContainer("1", "/nginx-proxy", "nginx:latest", "Up 2 hours", "running"),
                    DockerContainer("2", "/db-main", "postgres:14", "Exited (0) 5 mins ago", "exited"),
                    DockerContainer("3", "/web-app", "node:18", "Up 45 mins", "running")
                ),
                isLoading = false,
                onRefresh = {},
                onStart = {},
                onStop = {},
                onRemove = {},
                onPrune = {}
            )
        }
    }
}

@Preview(showBackground = true, widthDp = 1000)
@Composable
fun ImagesWidePreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ImagesContent(
                images = listOf(
                    DockerImage(id = "1", tags = listOf("nginx:latest"), size = 150 * 1024 * 1024, created = 0),
                    DockerImage(id = "2", tags = listOf("postgres:14-alpine"), size = 230 * 1024 * 1024, created = 0)
                ),
                isLoading = false,
                onRefresh = {},
                onPull = {},
                onRemove = {}
            )
        }
    }
}

@Preview(showBackground = true, widthDp = 400)
@Composable
fun ImagesMobilePreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ImagesContent(
                images = listOf(
                    DockerImage(id = "1", tags = listOf("nginx:latest"), size = 150 * 1024 * 1024, created = 0)
                ),
                isLoading = false,
                onRefresh = {},
                onPull = {},
                onRemove = {}
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun ComposePreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ComposeContent(
                composeFiles = listOf(
                    ComposeFile("/projects/app1/docker-compose.yml", "Web Application", "inactive"),
                    ComposeFile("/projects/db/docker-compose.yml", "Database Stack", "active")
                ),
                isLoading = false,
                onRefresh = {},
                onUp = {},
                onDown = {}
            )
        }
    }
}
