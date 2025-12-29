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
        stage('Deploy') {
            steps {
                script {
                    sh 'docker stop docker-manager || true'
                    sh 'docker rm docker-manager || true'
                    sh "docker run -d --name docker-manager -p 85:8080 --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock -v /sys/class/power_supply/BAT0:/sys/class/power_supply/BAT0 docker-manager-server:${env.BUILD_NUMBER}"
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

        stage('Deploy Client') {
            steps {
                script {
                    sh 'docker stop docker-manager-client || true'
                    sh 'docker rm docker-manager-client || true'
                    sh "docker run -d --name docker-manager-client -p 86:80 --restart unless-stopped docker-manager-client:${env.BUILD_NUMBER}"
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
    }
}
