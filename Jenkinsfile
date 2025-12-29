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
                    // Build image without needing maven credentials since we copied the jar
                    docker.build("docker-manager-server:${env.BUILD_NUMBER}", ".")
                }
            }
        }
        stage('Build Client Image') {
            steps {
                script {
                    // Dockerfile.client now handles the Next.js build using a multi-stage approach
                    docker.build("docker-manager-client:${env.BUILD_NUMBER}", "-f Dockerfile.client .")
                }
            }
        }

        stage('Deploy') {
            environment {
                BUILD_NUMBER = "${env.BUILD_NUMBER}"
            }
            steps {
                // Using single quotes to let the shell handle the environment variable
                sh 'docker compose up -d --remove-orphans'
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
    }
}
