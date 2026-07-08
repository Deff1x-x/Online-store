import type { ApiClient, QueryParams } from "../client";

export type ApiRecord = Record<string, unknown>;
export type ApiListResponse<T = ApiRecord> = T[];
export type ApiEntityResponse<T = ApiRecord> = T;

export type WithQuery = {
  query?: QueryParams;
};

export type ModuleFactory<TModule> = (client: ApiClient) => TModule;
