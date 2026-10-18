# **SecretSpec & Atlassian Forge Integration Guide**

This guide outlines the verified technical design and implementation for decoupling sample Atlassian Forge applications from local .env files using **SecretSpec**. By utilizing SecretSpec as a provider-agnostic configuration and secret management interface, developer teams can seamlessly source environment variables from secret managers like Keeper Security, with optional local fallback to .env files.

## **1\. Architecture Overview**

Atlassian Forge applications execute in a managed serverless FaaS environment. Configuration and secret management through .env files and the Forge CLI strictly operate during build, deployment, and developer execution time on the local workstation or CI/CD runner.

| Trait | Runtime Library (dependencies) | Dev Utility Wrapper (devDependencies)   |
| :---- | :---- | :---- |
| **Execution Context** | Inside Forge Lambda runtime environment | Local developer workstation or CI pipeline |
| **Secret Resolution** | Attempting runtime lookups in FaaS | Pre-deployment resolution via SecretSpec CLI |
| **Vault / SDK Footprint** | Bundled into production app deployment artifact | Isolated to developer tooling environment |
| **Sync Mechanics** | Not supported (Forge process.env is read-only) | Uploads secrets via forge variables:set |
| **Recommendation Status** | **Not Recommended** | **Verified Architecture** |

The integration is built as a developer CLI tool included via devDependencies. It acts as an execution proxy, parsing the secretspec.toml file, syncing scoped variables to the Forge environment, and delegating execution to the Atlassian Forge CLI.

## **2\. Configuration Specification (secretspec.toml)**

SecretSpec uses native TOML configuration files (secretspec.toml). Deployment controls, app runtime secrets, provider definitions, and variable scopes are defined within this specification.

### **Scoped Variable Definition**

Variables intended for remote synchronization to the Atlassian Forge environment are grouped under SecretSpec **scopes** (e.g., \[scopes.forge\_upload\]). This allows the adapter script to query only the variables required for Forge variable synchronization.  
version \= "1"

\[profiles.default\]  
\# Local Deployment & CLI Controls  
FORGE\_ENV \= "development"  
FORGE\_SITE \= "your-dev-site.atlassian.net"  
FORGE\_PRODUCT \= "jira"

\# App Configuration and Secrets  
THIRD\_PARTY\_API\_KEY \= { description \= "External Service API Key", required \= true }  
FEATURE\_FLAG\_SERVICE\_URL \= { description \= "Feature flag service endpoint", required \= true }

\# SecretSpec Scopes for Selective Upload  
\[scopes.forge\_upload\]  
secrets \= \["THIRD\_PARTY\_API\_KEY", "FEATURE\_FLAG\_SERVICE\_URL"\]

\# Provider Configuration  
\[providers.primary\]  
uses \= "keeper"  
\[providers.primary.config\]  
vault\_record\_title \= "Forge-Sample-App-Secrets"

\[providers.fallback\]  
uses \= "dotenv"  
\[providers.fallback.config\]  
path \= ".env.local"

## **3\. CLI Adapter Implementation (scripts/secretspec-forge.js)**

The adapter script reads configuration metadata and resolved values from SecretSpec, maps input CLI flags and default profile settings, syncs remote encrypted Forge variables, and forwards final arguments to @atlassian/forge-cli.  
\#\!/usr/bin/env node  
const { execSync, spawnSync } \= require('child\_process');

function parseArg(args, shortFlag, longFlag) {  
  const index \= args.findIndex(a \=\> a \=== shortFlag || a \=== longFlag);  
  if (index \!== \-1 && args\[index \+ 1\]) {  
    return args\[index \+ 1\];  
  }  
  return null;  
}

async function run() {  
  const rawArgs \= process.argv.slice(2);  
  const command \= rawArgs\[0\] || 'deploy';  
  const commandArgs \= rawArgs.slice(1);

  // 1\. Resolve values from SecretSpec  
  const values \= JSON.parse(  
    execSync('npx secretspec load \--format json', { encoding: 'utf-8' })  
  );

  // 2\. Resolve target environment (CLI argument overrides secretspec default)  
  const envArg \= parseArg(commandArgs, '-e', '--environment');  
  const forgeEnv \= envArg || values.FORGE\_ENV || 'development';

  // 3\. Resolve site & product defaults  
  const siteArg \= parseArg(commandArgs, '-s', '--site') || values.FORGE\_SITE;  
  const productArg \= parseArg(commandArgs, '-p', '--product') || values.FORGE\_PRODUCT;

  // 4\. Sync scoped variables to Forge environment  
  const uploadSecrets \= JSON.parse(  
    execSync('npx secretspec load \--scope forge\_upload \--format json', { encoding: 'utf-8' })  
  );

  for (const \[key, val\] of Object.entries(uploadSecrets)) {  
    if (\!val) continue;  
    console.log(\`\[SecretSpec\] Setting remote variable $key(${forgeEnv})...\`);  
    execSync(  
      \`npx forge variables:set \--environment "$forgeEnv"--encrypt"${key}" "\${val}"\`,  
      { stdio: 'inherit' }  
    );  
  }

  // 5\. Construct & delegate command to Forge CLI  
  let finalArgs \= \[command\];

  if (command \=== 'install') {  
    if (\!parseArg(commandArgs, '-e', '--environment')) finalArgs.push('-e', forgeEnv);  
    if (\!parseArg(commandArgs, '-s', '--site') && siteArg) finalArgs.push('-s', siteArg);  
    if (\!parseArg(commandArgs, '-p', '--product') && productArg) finalArgs.push('-p', productArg);  
    finalArgs.push(...commandArgs);  
  } else {  
    if (\!parseArg(commandArgs, '-e', '--environment')) finalArgs.push('-e', forgeEnv);  
    finalArgs.push(...commandArgs);  
  }

  console.log(\`\[SecretSpec\] Running: forge \${finalArgs.join(' ')}\`);  
  const result \= spawnSync('npx', \['forge', ...finalArgs\], { stdio: 'inherit' });  
  process.exit(result.status || 0);  
}

run().catch((err) \=\> {  
  console.error('\[SecretSpec\] Error executing wrapper:', err);  
  process.exit(1);  
});

## **4\. Package Configuration (package.json)**

Integrate the CLI adapter script into project scripts to enable smooth developer interactions:  
{  
  "name": "sample-forge-app",  
  "version": "1.0.0",  
  "private": true,  
  "scripts": {  
    "forge": "node ./scripts/secretspec-forge.js",  
    "deploy": "npm run forge \-- deploy",  
    "install:app": "npm run forge \-- install",  
    "tunnel": "npm run forge \-- tunnel",  
    "postinstall": "secretspec check"  
  },  
  "devDependencies": {  
    "@atlassian/forge-cli": "^10.0.0",  
    "@secretspec/cli": "^1.0.0"  
  }  
}

## **5\. Summary of Verified Features**

> * **Native TOML Configuration:** Uses secretspec.toml as the standard file format.  
> * **Scopes Partitioning:** Leverages \[scopes.forge\_upload\] to target variables for forge variables:set upload without custom schema fields.  
> * **CLI Proxy Pattern:** Installs as a devDependency wrapper rather than a runtime application library.  
> * **Argument Priority:** CLI flags passed at runtime override defaults set in secretspec.toml.  
> * **Provider Independence:** Enables primary providers (e.g., Keeper) with seamless fallback options (e.g., local .env files) for repository forks.