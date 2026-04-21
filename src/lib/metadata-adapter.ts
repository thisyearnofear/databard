/**
 * Unified metadata adapter — single entry point for all data sources.
 * Abstracts OpenMetadata, dbt Cloud, dbt Local, The Graph, and Dune behind a common interface.
 */
import type { ConnectionConfig, SchemaMeta } from "./types";
import { fetchSchemaMeta as fetchOM, listSchemas as listOM } from "./openmetadata";
import { fetchDbtCloudManifest, parseDbtManifest, loadLocalManifest, loadManifestFromContent } from "./dbt-adapter";
import { fetchTheGraphMeta, listTheGraphSchemas } from "./the-graph-adapter";
import { fetchDuneMeta, listDuneSchemas } from "./dune-adapter";

async function getDbtBundle(config: ConnectionConfig) {
  if (config.source === "dbt-cloud") {
    if (!config.dbtCloud) throw new Error("dbt Cloud config missing");
    return fetchDbtCloudManifest(config.dbtCloud.accountId, config.dbtCloud.projectId, config.dbtCloud.token);
  }
  if (config.source === "dbt-local") {
    if (!config.dbtLocal) throw new Error("dbt local config missing");
    if (config.dbtLocal.manifestContent) {
      return loadManifestFromContent(config.dbtLocal.manifestContent);
    }
    if (config.dbtLocal.manifestPath) {
      return loadLocalManifest(config.dbtLocal.manifestPath);
    }
    throw new Error("dbt local config requires manifestContent or manifestPath");
  }
  throw new Error(`Not a dbt source: ${config.source}`);
}

export async function listSchemas(config: ConnectionConfig): Promise<string[]> {
  if (config.source === "openmetadata") {
    if (!config.openmetadata) throw new Error("OpenMetadata config missing");
    return listOM(config.openmetadata);
  }
  if (config.source === "the-graph") {
    if (!config.theGraph) throw new Error("The Graph config missing");
    return listTheGraphSchemas(config.theGraph);
  }
  if (config.source === "dune") {
    if (!config.dune) throw new Error("Dune config missing");
    return listDuneSchemas(config.dune);
  }

  const { manifest, runResults } = await getDbtBundle(config);
  return parseDbtManifest(manifest, undefined, runResults).map((s) => s.fqn);
}

export async function fetchSchemaMeta(config: ConnectionConfig, schemaFqn: string): Promise<SchemaMeta> {
  if (config.source === "openmetadata") {
    if (!config.openmetadata) throw new Error("OpenMetadata config missing");
    return fetchOM(config.openmetadata, schemaFqn);
  }
  if (config.source === "the-graph") {
    if (!config.theGraph) throw new Error("The Graph config missing");
    return fetchTheGraphMeta(config.theGraph, schemaFqn.replace("the-graph.", ""));
  }
  if (config.source === "dune") {
    if (!config.dune) throw new Error("Dune config missing");
    return fetchDuneMeta(config.dune, schemaFqn.replace("dune.", ""));
  }

  const { manifest, runResults } = await getDbtBundle(config);
  const schemas = parseDbtManifest(manifest, schemaFqn, runResults);
  const schema = schemas.find((s) => s.fqn === schemaFqn);
  if (!schema) throw new Error(`Schema not found: ${schemaFqn}`);
  return schema;
}
