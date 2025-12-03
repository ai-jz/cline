import { describe, it } from "mocha"
import "should"
import { GrpcRecorderNoops } from "@/core/controller/grpc-recorder/grpc-recorder"
import { GrpcRecorderBuilder } from "@/core/controller/grpc-recorder/grpc-recorder.builder"
import { LogFileHandler } from "@/core/controller/grpc-recorder/log-file-handler"

describe("GrpcRecorderBuilder", () => {
	describe("when not enabling", () => {
		it("should return GrpcRecorderNoops when enableIf is false", () => {
			const builder = new GrpcRecorderBuilder()
			const recorder = builder.enableIf(false).build()

			recorder.should.be.instanceOf(GrpcRecorderNoops)
		})

		it("should return GrpcRecorderNoops when enableIf is false even with log file handler", () => {
			const builder = new GrpcRecorderBuilder()
			const logFileHandler = new LogFileHandler()
			const recorder = builder.withLogFileHandler(logFileHandler).enableIf(false).build()

			recorder.should.be.instanceOf(GrpcRecorderNoops)
		})
	})

	describe("GrpcRecorderNoops functionality", () => {
		it("should have no-op methods that don't throw errors", () => {
			const recorder = new GrpcRecorderNoops()

			recorder.recordRequest({
				request_id: "test-id",
				service: "TestService",
				method: "testMethod",
				message: {},
				is_streaming: false,
			})

			recorder.recordResponse("test-id", {
				request_id: "test-id",
				message: {},
			})

			recorder.recordError("test-id", "test error")

			const sessionLog = recorder.getSessionLog()
			sessionLog.should.have.property("startTime").which.is.a.String()
			sessionLog.should.have.property("entries").which.is.an.Array()
			sessionLog.entries.should.have.length(0)
		})
	})
})

describe("default filters with environment variable", () => {
	let originalEnv: string | undefined

	beforeEach(() => {
		originalEnv = process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED
	})

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED = originalEnv
		} else {
			delete process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED
		}
	})

	it("should apply default filters when GRPC_RECORDER_TESTS_FILTERS_ENABLED=true", () => {
		process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED = "true"

		const builder = new GrpcRecorderBuilder()
		const recorder = builder.enableIf(true).build()

		// These should be filtered by default filters
		recorder.recordRequest({
			request_id: "stream-1",
			service: "TestService",
			method: "testMethod",
			message: {},
			is_streaming: true, // Filtered by streaming filter
		})

		recorder.recordRequest({
			request_id: "ui-1",
			service: "cline.UiService", // Filtered by noisy service filter
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		recorder.recordRequest({
			request_id: "mcp-1",
			service: "cline.McpService", // Filtered by noisy service filter
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		recorder.recordRequest({
			request_id: "web-1",
			service: "cline.WebService", // Filtered by noisy service filter
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		// This should NOT be filtered
		recorder.recordRequest({
			request_id: "allowed-1",
			service: "AllowedService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		const sessionLog = recorder.getSessionLog()
		sessionLog.entries.should.have.length(1)
		sessionLog.entries[0].requestId.should.equal("allowed-1")
	})

	it("should not apply default filters when GRPC_RECORDER_TESTS_FILTERS_ENABLED is not set", () => {
		delete process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED

		const builder = new GrpcRecorderBuilder()
		const recorder = builder.enableIf(true).build()

		// All these should be recorded
		recorder.recordRequest({
			request_id: "stream-1",
			service: "TestService",
			method: "testMethod",
			message: {},
			is_streaming: true,
		})

		recorder.recordRequest({
			request_id: "ui-1",
			service: "cline.UiService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		const sessionLog = recorder.getSessionLog()
		sessionLog.entries.should.have.length(2)
	})

	it("should not apply default filters when GRPC_RECORDER_TESTS_FILTERS_ENABLED=false", () => {
		process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED = "false"

		const builder = new GrpcRecorderBuilder()
		const recorder = builder.enableIf(true).build()

		// All these should be recorded
		recorder.recordRequest({
			request_id: "stream-1",
			service: "TestService",
			method: "testMethod",
			message: {},
			is_streaming: true,
		})

		recorder.recordRequest({
			request_id: "ui-1",
			service: "cline.UiService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		const sessionLog = recorder.getSessionLog()
		sessionLog.entries.should.have.length(2)
	})

	it("should combine default filters with custom filters when env is set", () => {
		process.env.GRPC_RECORDER_TESTS_FILTERS_ENABLED = "true"

		const customFilter = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.service === "CustomFilteredService"

		const builder = new GrpcRecorderBuilder()
		const recorder = builder.enableIf(true).withFilters([customFilter]).build()

		// Filtered by default streaming filter
		recorder.recordRequest({
			request_id: "stream-1",
			service: "TestService",
			method: "testMethod",
			message: {},
			is_streaming: true,
		})

		// Filtered by default noisy service filter
		recorder.recordRequest({
			request_id: "ui-1",
			service: "cline.UiService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		// Filtered by custom filter
		recorder.recordRequest({
			request_id: "custom-1",
			service: "CustomFilteredService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		// Not filtered
		recorder.recordRequest({
			request_id: "allowed-1",
			service: "AllowedService",
			method: "testMethod",
			message: {},
			is_streaming: false,
		})

		const sessionLog = recorder.getSessionLog()
		sessionLog.entries.should.have.length(1)
		sessionLog.entries[0].requestId.should.equal("allowed-1")
	})
})
