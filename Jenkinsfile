// Jenkins pipeline for a Windows agent: install -> Playwright tests -> build.
// The agent needs Git and Node.js 24 on PATH (restart the Jenkins service after
// installing them) and the "Pipeline", "Git" and "JUnit" plugins.
pipeline {
  agent any

  environment {
    CI = 'true'
    // Keep the npm cache and the Playwright browsers inside the workspace, so the
    // job works no matter which Windows account runs the Jenkins service.
    npm_config_cache = "${WORKSPACE}\\.npm"
    PLAYWRIGHT_BROWSERS_PATH = "${WORKSPACE}\\.ms-playwright"
  }

  options {
    timeout(time: 30, unit: 'MINUTES') // the first run also downloads the browsers
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Install') {
      steps {
        bat 'npm ci'
        // Chromium, Firefox and WebKit for the installed @playwright/test version.
        // Skipped quickly when they are already downloaded.
        bat 'npx playwright install'
      }
    }

    stage('Test') {
      steps {
        bat 'npm test'
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
        bat 'npm run build'
        archiveArtifacts artifacts: 'dist/**', fingerprint: true
      }
    }
  }

  post {
    // Every build posts its result and the Playwright report to the team's
    // Discord channel. The webhook URL is the Jenkins credential
    // "discord-webhook" (kind: Secret text), never stored in the repo.
    always {
      withCredentials([string(credentialsId: 'discord-webhook', variable: 'DISCORD_WEBHOOK')]) {
        bat "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\notify-discord.ps1 -Status ${currentBuild.currentResult} -Build ${env.BUILD_NUMBER}"
      }
    }
  }
}
