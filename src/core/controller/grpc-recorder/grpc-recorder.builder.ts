import { GrpcRecorder, GrpcRecorderNoops, IRecorder } from "@/core/controller/grpc-recorder/grpc-recorder"
import { LogFileHandler, LogFileHandlerNoops } from "@/core/controller/grpc-recorder/log-file-handler"
import { GrpcRequestFilterPredicate } from "@/core/controller/grpc-recorder/types"

/**
 * Default filter set that ignores streaming requests and known noisy services.
 * These filters are automatically applied when GRPC_RECORDER_TESTS_FILTERS_ENABLED=true.
 */
export function getDefaultFilters(): GrpcRequestFilterPredicate[] {
	const noisyServices = ["cline.UiService", "cline.McpService", "cline.WebService"]

	return [
		// Filter out streaming requests
		(req) => req.is_streaming === true,
		// Filter out known noisy services
		(req) => noisyServices.includes(req.service),
	]
}

/**
 * A builder class for constructing a gRPC recorder instance.
 *
 * This class follows the Builder pattern, allowing consumers
 * to configure logging behavior, add filters, and control whether recording
 * is enabled or disabled before creating a final `IRecorder`.
 */
export class GrpcRecorderBuilder {
	private fileHandler: LogFileHandler | null = null
	private enabled: boolean = true
	private customFilters: GrpcRequestFilterPredicate[] = []

	public withLogFileHandler(handler: LogFileHandler): this {
		this.fileHandler = handler
		return this
	}

	public enableIf(condition: boolean): this {
		this.enabled = condition
		return this
	}

	/**
	 * Adds custom filter predicates to the recorder.
	 * Filters are evaluated in order; if any filter returns true, the request is skipped.
	 *
	 * @param filters - Array of filter predicates to add
	 * @returns this builder for chaining
	 */
	public withFilters(filters: GrpcRequestFilterPredicate[]): this {
		this.customFilters = filters
		return this
	}

	public build(): IRecorder {
		if (!this.enabled) {
			return new GrpcRecorderNoops()
		}

		// Merge environment-driven default filters with custom filters
		// Environment filters are prepended to execute first
		const allFilters = this.shouldApplyDefaultFilters() ? [...getDefaultFilters(), ...this.customFilters] : this.customFilters

		const handler = this.fileHandler ?? new LogFileHandlerNoops()
		return new GrpcRecorder(handler, allFilters)
	}

	private shouldApplyDefaultFilters(): boolean {
		return process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED === "true"
	}
}
