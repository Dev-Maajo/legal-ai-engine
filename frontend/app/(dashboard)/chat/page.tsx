import { Header } from "@/components/layout/Header";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="AI Legal Chat"
        subtitle="Ask questions about your uploaded legal documents"
      />
      <div className="flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
}
