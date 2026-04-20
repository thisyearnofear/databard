/**
 * Unified metadata adapter — supports OpenMetadata, dbt Cloud, and local dbt.
 * Abstracts data source differences behind a common interface.
 */
import type { ConnectionConfig, SchemaMeta } from "./types";
import { fetchSchemaMeta as fetchOM, listSchemas as listOM } from "./openmetadata";
import { fetchDbtCloudManifest, parseDbtManifest, loadLocalManifest } from "./dbt-adapter";
import { cache } from "./cache";

export async function listSchemas(config: ConnectionConfig): Promise<string[]> {
  switch (config.source) {
    case "openmetadata":
      if (!config.openmetadata) throw new Error("OpenMetadata config missing");
      return listOM(config.openmetadata);

    case "dbt-cloud": {
      if (!config.dbtCloud) throw new Error("dbt Cloud config missing");
      const cacheKey = `dbt:schemas:${config.dbtCloud.accountId}:${config.dbtCloud.projectId}`;
      const cached = cache.get<string[]>(cacheKey);
      if (cached) return cached;

      const manifest = await fetchDbtCloudManifest(
        config.dbtCloud.accountId,
        config.dbtCloud.projectId,
        config.dbtCloud.token
      );
      const schemas = parseDbtManifest(manifest).map((s) => s.fqn);
      cache.set(cacheKey, schemas, 300);
      return schemas;
    }

    case "dbt-local": {
      if (!config.dbtLocal) throw new Error("dbt local config missing");
      const cacheKey = `dbt:local:schemas:${config.dbtLocal.manifestPath}`;
      const cached = cache.get<string[]>(cacheKey);
      if (cached) return cached;

      const manifest = await loadLocalManifest(config.dbtLocal.manifestPath);
      const schemas = parseDbtManifest(manifest).map((s) => s.fqn);
      cache.set(cacheKey, schemas, 300);
      return schemas;
    }

    default:
      throw new Error(`Unsupported data source: ${config.source}`);
  }
}

export async function fetchSchemaMeta(
  config: ConnectionConfig,
  schemaFqn: string
): Promise<SchemaMeta> {
  switch (config.source) {
    case "openmetadata":
      if (!config.openmetadata) throw new Error("OpenMetadata config missing");
      return fetchOM(config.openmetadata, schemaFqn);

    case "dbt-cloud": {
      if (!config.dbtCloud) throw new Error("dbt Cloud config missing");
      const cacheKey = `dbt:schema:${config.dbtCloud.accountId}:${config.dbtCloud.projectId}:${schemaFqn}`;
      const cached = cache.get<SchemaMeta>(cacheKey);
      if (cached) return cached;

      const manifest = await fetchDbtCloudManifest(
        config.dbtCloud.accountId,
        config.dbtCloud.projectId,
        config.dbtCloud.token
      );
      const schemas = parseDbtManifest(manifest, schemaFqn);
      const schema = schemas.find((s) => s.fqn === schemaFqn);
      if (!schema) throw new Error(`Schema not found: ${schemaFqn}`);
      
      cache.set(cacheKey, schema, 600);
      return schema;
    }

    case "dbt-local": {
      if (!config.dbtLocal) throw new Error("dbt local config missing");
      const cacheKey = `dbt:local:schema:${config.dbtLocal.manifestPath}:${schemaFqn}`;
      const cached = cache.get<SchemaMeta>(cacheKey);
      if (cached) return cached;

      const manifest = await loadLocalManifest(config.dbtLocal.manifestPath);
      const schemas = parseDbtManifest(manifest, schemaFqn);
      const schema = schemas.find((s) => s.fqn === schemaFqn);
      if (!schema) throw new Error(`Schema not found: ${schemaFqn}`);
      
      cache.set(cacheKey, schema, 600);
      return schema;
    }

    default:
      throw new Error(`Unsupported data source: ${config.source}`);
  }
}
