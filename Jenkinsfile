pipeline {
    agent any

    stages {
//         stage('Test') {
//             steps {
//                 sh './gradlew test'
//             }
//         }

        stage('Build FatJar') {
            steps {
                // Use shadowJar task to build the FatJar
                sh './gradlew clean'
                sh './gradlew :server:shadowJar'
            }
        }

        stage('Build Docker Image') {
            steps {
                // Copy the built jar to root so Docker context can see it
                sh 'cp server/build/libs/server-all.jar server-all.jar'
                
                script {
                    // Add build label for tracking and selective cleanup
                    docker.build("docker-manager-server:${env.BUILD_NUMBER}", "--label jenkins_build_id=${env.BUILD_ID} .")
                }
            }
        }
        stage('Build Client Image') {
            steps {
                script {
                    // Dockerfile.client now handles the Next.js build using a multi-stage approach
                    docker.build("docker-manager-client:${env.BUILD_NUMBER}", "--label jenkins_build_id=${env.BUILD_ID} -f Dockerfile.client .")
                }
            }
        }

        stage('Deploy') {
            environment {
                BUILD_NUMBER = "${env.BUILD_NUMBER}"
            }
            steps {
                script {
                    def composeCmd = ""
                    // Check standard paths
                    if (sh(script: "docker compose version", returnStatus: true) == 0) {
                        composeCmd = "docker compose"
                    } else if (sh(script: "docker-compose version", returnStatus: true) == 0) {
                        composeCmd = "docker-compose"
                    } else if (fileExists('/usr/libexec/docker/cli-plugins/docker-compose')) {
                        composeCmd = "/usr/libexec/docker/cli-plugins/docker-compose"
                    } else if (fileExists('/usr/lib/docker/cli-plugins/docker-compose')) {
                        composeCmd = "/usr/lib/docker/cli-plugins/docker-compose"
                    } else {
                        // Let's try to find where it is
                        sh 'find /usr -name docker-compose 2>/dev/null || true'
                        error "Docker Compose binary not found. Please ensure docker-compose-plugin is correctly linked."
                    }
                    echo "Using compose command: ${composeCmd}"
                    sh "${composeCmd} up -d --remove-orphans"
                }
            }
        }
    }
    
    post {
        always {
            script {
                // Remove only containers and images created by this specific Jenkins build
                // This prevents deleting other users' Docker resources
                sh "docker ps -a --filter label=jenkins_build_id=${env.BUILD_ID} -q | xargs -r docker rm -f || true"
                sh "docker images --filter label=jenkins_build_id=${env.BUILD_ID} -q | xargs -r docker rmi -f || true"
            }
            cleanWs()
        }
    }
}
