pipeline {
    agent any

    environment {
        // Credentials for Maven Repository
        MAVEN_CREDS = credentials('maven-repo-credentials')
        MAVEN_USERNAME = "${MAVEN_CREDS_USR}"
        MAVEN_PASSWORD = "${MAVEN_CREDS_PSW}"
    }

    stages {
//         stage('Test') {
//             steps {
//                 sh './gradlew test'
//             }
//         }

        stage('Publish FatJar') {
            steps {
                sh './gradlew :server:publishFatJarPublicationToMavenRepository'
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    docker.build("docker-manager-server:${env.BUILD_NUMBER}", 
                        "--build-arg MAVEN_USERNAME=${MAVEN_USERNAME} " +
                        "--build-arg MAVEN_PASSWORD=${MAVEN_PASSWORD} ."
                    )
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
