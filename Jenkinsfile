pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                sh './gradlew test'
            }
        }

        stage('Build FatJar') {
            steps {
                // Use shadowJar task to build the FatJar
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
    }
    
    post {
        always {
            cleanWs()
        }
    }
}
