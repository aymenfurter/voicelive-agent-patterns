@description('Base name for all resources')
param name string

@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Container image for backend (e.g. <registry>.azurecr.io/voicelive-qa-backend:<tag>). When using `azd up`, this is set automatically by the build pipeline.')
param backendImage string

@description('Container image for question-service (e.g. <registry>.azurecr.io/voicelive-qa-question-service:<tag>). When using `azd up`, this is set automatically by the build pipeline.')
param questionServiceImage string

@description('Azure OpenAI model deployment name')
param openAiDeploymentName string = 'gpt-4o-realtime-preview'

@description('Azure OpenAI text model deployment name')
param openAiTextDeploymentName string = 'gpt-4.1'

@description('Voice name for TTS')
param voiceName string = 'en-US-Aria:DragonHDLatestNeural'

// ─── Managed Identity ───────────────────────────────────────────────────────

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
}

// ─── Log Analytics & Container Apps Environment ─────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── Azure AI Services (Voice Live API) ─────────────────────────────────────

resource aiServices 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: '${name}-ai'
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: '${name}-ai'
    publicNetworkAccess: 'Enabled'
  }
}

// ─── Azure OpenAI ───────────────────────────────────────────────────────────

resource openAi 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: '${name}-openai'
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: '${name}-openai'
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiRealtimeDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: openAiDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o-realtime-preview'
      version: '2024-12-17'
    }
  }
}

resource openAiTextDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAi
  name: openAiTextDeploymentName
  dependsOn: [openAiRealtimeDeployment]
  sku: {
    name: 'GlobalStandard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1'
      version: '2025-04-14'
    }
  }
}

// ─── Role Assignments ───────────────────────────────────────────────────────

// Cognitive Services User on AI Services
resource aiServicesRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, managedIdentity.id, 'CognitiveServicesUser')
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services OpenAI User on OpenAI
resource openAiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAi.id, managedIdentity.id, 'CognitiveServicesOpenAIUser')
  scope: openAi
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Container App: Question Service ────────────────────────────────────────

resource questionServiceApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-question-svc'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 8001
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'question-service'
          image: questionServiceImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '8001' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// ─── Container App: Backend ─────────────────────────────────────────────────

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-backend'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_VOICE_ENDPOINT', value: 'https://${aiServices.properties.endpoint}' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAi.properties.endpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: openAiDeploymentName }
            { name: 'AZURE_OPENAI_TEXT_DEPLOYMENT', value: openAiTextDeploymentName }
            { name: 'QUESTION_SERVICE_URL', value: 'https://${questionServiceApp.properties.configuration.ingress.fqdn}' }
            { name: 'VOICE_NAME', value: voiceName }
            { name: 'AZURE_CLIENT_ID', value: managedIdentity.properties.clientId }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

// ─── Outputs ────────────────────────────────────────────────────────────────

output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output questionServiceUrl string = 'https://${questionServiceApp.properties.configuration.ingress.fqdn}'
output managedIdentityClientId string = managedIdentity.properties.clientId
output aiServicesEndpoint string = aiServices.properties.endpoint
output openAiEndpoint string = openAi.properties.endpoint
