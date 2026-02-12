import { useState, useRef, useEffect } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

const BACKEND_URL = "http://localhost:8000";

// An interface defines the shape of an object
interface Message {
	role: "user" | "assistant";
	content: string;
	metrics?: {
		latency: number;
		tokens: number;
		tokensPerSecond: number;
	};
}

// Created a Response interface to be used for catching any reponses from response.json() that dont match the expected format
interface ApiResponse {
	choices: { text: string }[];
	usage?: { completion_tokens: number };
}

function App() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [model, setModel] = useState("facebook/opt-1.3b");
	const [maxTokens, setMaxTokens] = useState(150);
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const models = ["llama3.2"];

	// Auto-scroll to bottom on new messages
	// This useEffect function gets called on mount or anytime 'message' changes
	// Mount = the component appears on the screen for the first time / first render. Unmount = component is removed from the screen.
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Calculate session metrics
	// Filter returns all messages (m) that have metrics
	// Then map iterates over all m's and returns the metrics in an array
	const sessionMetrics = messages
		.filter((m) => m.metrics)
		.map((m) => m.metrics!);

	// Calculates average latency. Checks if length of sessionMetrics > 0. If so, uses reduce to sum latency of all bot messages and divides by length for avg (seconds).
	// Else return 0
	const avgLatency =
		sessionMetrics.length > 0
			? sessionMetrics.reduce((sum, m) => sum + m.latency, 0) /
				sessionMetrics.length
			: 0;

	// Calculates average throughput by summing tokensPerSecond for all response messages and dividing by total message count
	const avgThroughput =
		sessionMetrics.length > 0
			? sessionMetrics.reduce((sum, m) => sum + m.tokensPerSecond, 0) /
				sessionMetrics.length
			: 0;

	// Calculates total tokens by suming token count from all messages
	const totalTokens = sessionMetrics.reduce((sum, m) => sum + m.tokens, 0);

	//
	const handleSend = async () => {
		// If the input is empty OR a request is already in progress, do nothing and exit
		if (!input.trim() || isLoading) return;

		const userMessage: Message = { role: "user", content: input };
		// Calls setMessages and adds userMessage to the end of the messages array
		setMessages((prev) => [...prev, userMessage]);
		// Clears the chat input text area
		setInput("");
		// Before the actual request to the model gets made, this turns 'loading' to true
		setIsLoading(true);

		try {
			// Logs startTime for metrics - used later
			const startTime = performance.now();
			// This is where the actual request to the model gets made. Function execution is paused with await until a response is returned
			const response = await fetch(`${BACKEND_URL}/v1/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					// State variables for model, prompt and maxTokens passed in below
					model: model,
					prompt: input,
					max_tokens: maxTokens,
				}),
			});

			// Calculates latency. Substracts 'startTime' form the current time.
			const latency = (performance.now() - startTime) / 1000;

			if (response.ok) {
				// Parses the raw HTTP reponse into a javascript object. Waits for the response body to be fully downloaded
				// Specified data as type Response so that it will error if the response back does match that interface
				const data: ApiResponse = await response.json();
				const text = data.choices[0].text;

				// ?? - nullish coalescing operator. If left side is null or undefined then use right side
				const tokens = data.usage?.completion_tokens ?? text.split(" ").length;
				const tokensPerSecond = latency > 0 ? tokens / latency : 0;

				// Create new Message interface for the message returned by the model
				const assistantMessage: Message = {
					role: "assistant",
					content: text,
					metrics: { latency, tokens, tokensPerSecond },
				};
				// Call state setter function and add assistantMessage to the messages array
				setMessages((prev) => [...prev, assistantMessage]);
			} else {
				// If theres an error set the new message to include error details
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: `Error: API returned ${response.status}`,
					},
				]);
			}
		} catch (err) {
      // Changed 'prev' to 'currentMessages'
			setMessages((currectMessages) => [
				...currectMessages,
				{ role: "assistant", content: `Error: Could not connect to backend` },
			]);
		} finally {
			// Once all above logic finished, setIsLoading back to false. This resets the page and allows the user the type/ sent new messages.
			setIsLoading(false);
		}
	};

	// If you press Enter alone, it sends the message. If you press Shift + Enter, it lets you add a new line in the textarea
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// calls state setter function and restores messages back to an empty array.
	const clearChat = () => {
		setMessages([]);
	};

	return (
		<div className="flex h-screen bg-white text-[#363636]">
			{/* Sidebar */}
			<div className="w-72 bg-[#edede8] text-white flex flex-col">
				{/* Logo */}
				<div className="p-5 border-b border-white/10">
					<h1 className="text-4xl font-bold text-[#e73452]">ResetData</h1>
					<p className="text-xs text-[#363636] mt-1">LLM Chat Playground</p>
				</div>

				{/* Model selector */}
				<div className="p-4">
					<label className="text-s font-bold text-[#363636] uppercase tracking-wider">
						Models
					</label>
					<Select value={model} onValueChange={setModel}>
						<SelectTrigger className="w-full mt-2 bg-white/10 text-[#363636] text-sm border-white/10 focus:ring-[#e8566c]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="bg-[#FFFFFF] border-white/10">
							{models.map((m) => (
								<SelectItem
									key={m}
									value={m}
									className="text-[#363636] text-sm hover:bg-[#e8566c] focus:bg-[#3d6d71] focus:text-white"
								>
									{m}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Max tokens slider */}
				<div className="px-4 pb-4">
					<label className="text-xs font-bold text-[#363636] uppercase tracking-wider">
						Max Tokens: {maxTokens}
					</label>
					<Slider
						min={50}
						max={500}
						step={50}
						value={[maxTokens]}
						onValueChange={(val) => setMaxTokens(val[0])}
						className="mt-2"
					/>
				</div>

				{/* Session Metrics */}
				<div className="px-4 mt-2">
					<h3 className="text-xs font-bold text-[#363636] uppercase tracking-wider mb-3">
						Session Metrics
					</h3>
					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-[#363636]">Avg Latency</span>
							<span className="text-[#363636]">{avgLatency.toFixed(2)}s</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-[#363636]">Avg Throughput</span>
							<span className="text-[#363636]">
								{avgThroughput.toFixed(1)} tok/s
							</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-[#363636]">Total Tokens</span>
							<span className="text-[#363636]">{totalTokens}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-[#363636]">Requests</span>
							<span className="text-[#363636]">{sessionMetrics.length}</span>
						</div>
					</div>
				</div>

				{/* Clear + Footer */}
				<div className="mt-auto p-4 border-t border-white/10">
					<button
						onClick={clearChat}
						className="w-full py-2 text-sm rounded-lg bg-[#d1d1d1] text-black border border-[#d1d1d1] hover:bg-[#c0c0c0] transition-colors"
					>
						Clear Chat
					</button>
					<div className="mt-3 flex items-center gap-2">
						<div className="w-8 h-8 rounded-full bg-[#e8566c] flex items-center justify-center text-xs font-bold">
							AA
						</div>
						<div>
							<p className="text-sm text-[#363636]">Adrian Amoddio</p>
							<p className="text-xs text-gray-400">AAmoddio@resetdata.com.au</p>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 flex flex-col">
				{/* Header */}
				<div className="border-b border-gray-200 px-6 py-4">
					<h2 className="text-xl font-semibold">Playground</h2>
					<p className="text-sm text-gray-500">Test AI models in real-time</p>
				</div>

				{/* Model Info Bar */}
				<div className="mx-6 mt-4 p-4 border border-gray-200 rounded-lg">
					<p className="font-medium">{model}</p>
					<div className="flex gap-4 mt-1 text-sm text-gray-500">
						<span>⚡ 128,000 tokens</span>
						<span>Max Output: {maxTokens}</span>
					</div>
				</div>

				{/* Chat Area */}
				<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
					{messages.length === 0 && (
						<div className="flex items-center justify-center h-full text-gray-400">
							<p>Send a message to start chatting</p>
						</div>
					)}

					{messages.map((msg, i) => (
						<div
							key={i}
							className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
						>
							<div className="flex items-start gap-2 max-w-[70%]">
								{msg.role === "assistant" && (
									<div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
										RD
									</div>
								)}
								<div>
									<div
										className={`px-4 py-2.5 rounded-2xl ${
											msg.role === "user"
												? "bg-[#dc3652] text-white"
												: "bg-gray-100 text-gray-900"
										}`}
									>
										<p className="text-sm whitespace-pre-wrap">{msg.content}</p>
									</div>
									{msg.metrics && (
										<p className="text-xs text-gray-400 mt-1 px-2">
											⏱️ {msg.metrics.latency.toFixed(2)}s &nbsp; 🎯{" "}
											{msg.metrics.tokens} tokens &nbsp; ⚡{" "}
											{msg.metrics.tokensPerSecond.toFixed(1)} tok/s
										</p>
									)}
								</div>
								{msg.role === "user" && (
									<div className="w-8 h-8 rounded-full bg-[#e8566c] flex items-center justify-center text-xs font-bold text-white shrink-0">
										A
									</div>
								)}
							</div>
						</div>
					))}

					{isLoading && (
						<div className="flex justify-start">
							<div className="flex items-start gap-2">
								<div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
									RD
								</div>
								<div className="bg-gray-100 px-4 py-2.5 rounded-2xl">
									<div className="flex gap-1">
										<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
										<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]" />
										<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]" />
									</div>
								</div>
							</div>
						</div>
					)}

					<div ref={messagesEndRef} />
				</div>

				{/* Metrics Bar */}
				{sessionMetrics.length > 0 && (
					<div className="px-6 py-2 border-t border-gray-100 flex gap-6 text-sm text-gray-500">
						<span>Tokens: {totalTokens}</span>
						<span>Requests: {sessionMetrics.length}</span>
						<span className="text-[#e8566c]">
							$ {(totalTokens * 0.000001).toFixed(6)}
						</span>
					</div>
				)}

				{/* Input Area */}
				<div className="border-t border-gray-200 p-4">
					<div className="flex gap-2 items-end max-w-4xl mx-auto">
						<textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Type your message..."
							rows={1}
							className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:border-[#e8566c] focus:ring-1 focus:ring-[#e8566c]"
						/>
						{/* Message Send Button */}
						<button
							onClick={handleSend}
							disabled={!input.trim() || isLoading}
							className="p-3 rounded-xl bg-[#e53855] text-white hover:bg-[#d44a5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								className="w-5 h-5"
							>
								<path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default App;
