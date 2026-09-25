import axios from 'axios'

/**
 * Backend API client. `VITE_API_URL` is absolute in local development
 * (http://localhost:8080/api) and relative (`/api`) behind the Docker nginx proxy.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})
