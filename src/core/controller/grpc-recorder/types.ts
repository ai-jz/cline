export interface GrpcLogEntry {
	requestId: string
	service: string
	method: string
	isStreaming: boolean
	request: {
		message: any
	}
	response?: {
		message?: any
		error?: string
		isStreaming?: boolean
		sequenceNumber?: number
	}
	duration?: number
	status: "pending" | "completed" | "error"
}

export interface SessionStats {
	totalRequests: number
	pendingRequests: number
	completedRequests: number
	errorRequests: number
}

export interface GrpcSessionLog {
	startTime: string
	stats?: SessionStats
	entries: GrpcLogEntry[]
}

/**
 * A predicate function that determines whether a gRPC request should be filtered (skipped from logging).
 *
 * @param request - The gRPC request to evaluate
 * @returns true if the request should be filtered (not logged), false otherwise
 */
export type GrpcRequestFilterPredicate = (request: {
	service: string
	method: string
	is_streaming: boolean
	message: any
}) => boolean
