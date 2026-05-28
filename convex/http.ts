import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth registers its own endpoints under /.well-known/ and /api/auth/
auth.addHttpRoutes(http);

export default http;
