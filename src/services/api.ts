// src/services/api.ts
import axios from 'axios';

export type Row = Record<string, unknown>;

const BASE = process.env.REACT_APP_API_URL || 'https://data.ny.gov/resource/kufs-yh3x.json';
const APP_TOKEN = process.env.REACT_APP_APP_TOKEN || '';

export const apiClient = axios.create({
  baseURL: BASE,
  headers: {
    'Accept': 'application/json',
    ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
  },
  timeout: 15000,
});

export async function fetchBusRows(query = '?$limit=200'): Promise<Row[]> {
  const url = BASE + (query.startsWith('?') ? query : '?' + query);
  const res = await apiClient.get<Row[]>(url);
  return res.data ?? [];
}

export {};
