import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Context } from "openapi-backend";
import { components } from "../generated/openapi.ts";

export function createApp (ctx: Context<{ content: { "application/json": components["schemas"]["App"]; }; }>, req: ExpressRequest, res: ExpressResponse): Promise<ExpressResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
}
export function updateApp (ctx: Context<{ content: { "application/json": components["schemas"]["App"]; }; }>, req: ExpressRequest, res: ExpressResponse): Promise<ExpressResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
}

export function deleteApp (ctx: Context<{ appId: number; }>, req: ExpressRequest, res: ExpressResponse): Promise<ExpressResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
}