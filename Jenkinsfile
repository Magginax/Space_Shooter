// Jenkins pipeline: install -> Playwright tests -> build.
// Requires the "Docker Pipeline" and "JUnit" plugins and Docker on the agent.
// The image tag MUST match the @playwright/test version in package.json.
pipeline {
  agent {
    docker {
      image 'mcr.microsoft.com/playwright:v1.63.0-noble'
      args '--ipc=host'
    }
  }

  environment {
    CI = 'true'
    // Keep the npm cache inside the workspace (the container user has no writable $HOME).
    npm_config_cache = "${WORKSPACE}/.npm"
  }

  options {
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Test') {
      steps {
        sh 'npm test'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'test-results/junit.xml'
          archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
        }
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
        archiveArtifacts artifacts: 'dist/**', fingerprint: true
      }
    }
  }
}
