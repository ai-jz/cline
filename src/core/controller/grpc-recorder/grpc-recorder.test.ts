import { GrpcRecorder, IRecorder } from "@core/controller/grpc-recorder/grpc-recorder"
import { expect } from "chai"
import { ExtensionMessage } from "@/shared/ExtensionMessage"
import { GrpcRequest } from "@/shared/WebviewMessage"

describe("grpc-recorder", () => {
	let recorder: IRecorder

	before(async () => {
		recorder = GrpcRecorder.builder().enableIf(true).build()
	})

	describe("GrpcRecorder", () => {
		it("matches multiple request, response and stats", async () => {
			interface UseCase {
				request: GrpcRequest
				response: ExtensionMessage["grpc_response"]
				expectedStatus: string
			}
			const requestResponseUseCases: UseCase[] = [
				{
					request: {
						service: "the-service",
						method: "the-method",
						message: "the-message",
						request_id: "request-id-1",
						is_streaming: false,
					},
					response: {
						request_id: "request-id-1",
						message: "the-message-response",
						error: "",
					},
					expectedStatus: "completed",
				},
				{
					request: {
						service: "streaming-service",
						method: "stream-method",
						message: { data: "streaming-data", count: 42 },
						request_id: "request-id-2",
						is_streaming: true,
					},
					response: {
						request_id: "request-id-2",
						message: { streamData: "chunk-1" },
						error: "",
						is_streaming: true,
						sequence_number: 1,
					},
					expectedStatus: "completed",
				},
				{
					request: {
						service: "another-service",
						method: "another-method",
						message: { complex: { nested: "object", array: [1, 2, 3] } },
						request_id: "request-id-3",
						is_streaming: false,
					},
					response: {
						request_id: "request-id-3",
						message: "",
						error: "Something went wrong",
					},
					expectedStatus: "error",
				},
			]

			const initialExpectedStatus = "pending"

			requestResponseUseCases.forEach((us: UseCase, index: number) => {
				recorder.recordRequest(us.request)

				let sessionLog = recorder.getSessionLog()
				expect(sessionLog.entries).length(index + 1)

				expect(sessionLog.entries[index]).to.include({
					service: us.request.service,
					method: us.request.method,
					isStreaming: us.request.is_streaming,
					requestId: us.request.request_id,
					status: initialExpectedStatus,
				})

				if (us.response) {
					recorder.recordResponse(us.request.request_id, us.response)
				}
				sessionLog = recorder.getSessionLog()

				expect(sessionLog.entries[index].status).equal(us.expectedStatus)
				expect(sessionLog.entries[index].response).to.deep.include({
					error: us.response?.error,
				})
			})

			const sessionLog = recorder.getSessionLog()
			expect(sessionLog.stats).to.include({
				totalRequests: 3,
				pendingRequests: 0,
				completedRequests: 2,
				errorRequests: 1,
			})
		})
	})
})

describe("GrpcRecorder with custom filters", () => {
	it("should filter out requests when custom filter returns true", async () => {
		// Create a filter that filters out requests from "filtered-service"
		const customFilter = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.service === "filtered-service"

		const recorderWithFilter = GrpcRecorder.builder().enableIf(true).withFilters([customFilter]).build()

		// This request should be filtered
		recorderWithFilter.recordRequest({
			service: "filtered-service",
			method: "filtered-method",
			message: "test",
			request_id: "filtered-1",
			is_streaming: false,
		})

		// This request should NOT be filtered
		recorderWithFilter.recordRequest({
			service: "allowed-service",
			method: "allowed-method",
			message: "test",
			request_id: "allowed-1",
			is_streaming: false,
		})

		const sessionLog = recorderWithFilter.getSessionLog()
		expect(sessionLog.entries).length(1)
		expect(sessionLog.entries[0].service).equal("allowed-service")
	})

	it("should apply multiple filters with OR logic", async () => {
		const filter1 = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.service === "service-a"
		const filter2 = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.method === "method-b"

		const recorderWithFilters = GrpcRecorder.builder().enableIf(true).withFilters([filter1, filter2]).build()

		// Filtered by filter1
		recorderWithFilters.recordRequest({
			service: "service-a",
			method: "method-1",
			message: "test",
			request_id: "req-1",
			is_streaming: false,
		})

		// Filtered by filter2
		recorderWithFilters.recordRequest({
			service: "service-x",
			method: "method-b",
			message: "test",
			request_id: "req-2",
			is_streaming: false,
		})

		// Not filtered
		recorderWithFilters.recordRequest({
			service: "service-x",
			method: "method-y",
			message: "test",
			request_id: "req-3",
			is_streaming: false,
		})

		const sessionLog = recorderWithFilters.getSessionLog()
		expect(sessionLog.entries).length(1)
		expect(sessionLog.entries[0].requestId).equal("req-3")
	})

	it("should filter streaming requests when filter checks is_streaming", async () => {
		const streamingFilter = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.is_streaming === true

		const recorderWithFilter = GrpcRecorder.builder().enableIf(true).withFilters([streamingFilter]).build()

		// Filtered because it's streaming
		recorderWithFilter.recordRequest({
			service: "stream-service",
			method: "stream-method",
			message: "test",
			request_id: "stream-1",
			is_streaming: true,
		})

		// Not filtered
		recorderWithFilter.recordRequest({
			service: "regular-service",
			method: "regular-method",
			message: "test",
			request_id: "regular-1",
			is_streaming: false,
		})

		const sessionLog = recorderWithFilter.getSessionLog()
		expect(sessionLog.entries).length(1)
		expect(sessionLog.entries[0].requestId).equal("regular-1")
	})

	it("should not count filtered requests in stats", async () => {
		const filter = (req: { service: string; method: string; is_streaming: boolean; message: any }) =>
			req.service === "noisy-service"

		const recorderWithFilter = GrpcRecorder.builder().enableIf(true).withFilters([filter]).build()

		// 3 filtered requests
		for (let i = 0; i < 3; i++) {
			recorderWithFilter.recordRequest({
				service: "noisy-service",
				method: "noisy-method",
				message: "test",
				request_id: `noisy-${i}`,
				is_streaming: false,
			})
		}

		// 2 recorded requests
		recorderWithFilter.recordRequest({
			service: "important-service",
			method: "important-method",
			message: "test",
			request_id: "important-1",
			is_streaming: false,
		})
		recorderWithFilter.recordRequest({
			service: "important-service",
			method: "important-method",
			message: "test",
			request_id: "important-2",
			is_streaming: false,
		})

		const sessionLog = recorderWithFilter.getSessionLog()
		expect(sessionLog.entries).length(2)
	})
})
