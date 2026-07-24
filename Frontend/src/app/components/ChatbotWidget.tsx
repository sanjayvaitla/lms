import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Trash2, Copy, Check } from 'lucide-react';
import { useLocation } from 'react-router';
import axiosInstance from '../../lib/axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 hover:bg-gray-200/50 rounded text-gray-500 hover:text-gray-700 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatbotProps {
  inline?: boolean;
  moduleIdProp?: string;
}

export function ChatbotWidget({ inline = false, moduleIdProp }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(inline);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const location = useLocation();
  
  // Extract moduleId from URL if we are in a course player
  // Example path: /student/portal/courses/some-course/modules/some-module
  const getModuleId = () => {
    if (moduleIdProp) return moduleIdProp;
    const sessionMatch = location.pathname.match(/\/my-courses\/[^/]+\/session\/([a-zA-Z0-9-]+)/);
    if (sessionMatch) return sessionMatch[1];
    const legacyMatch = location.pathname.match(/\/modules\/([a-zA-Z0-9-]+)/);
    return legacyMatch ? legacyMatch[1] : undefined;
  };

  const getEnrollmentId = () => {
    const match = location.pathname.match(/\/my-courses\/([a-zA-Z0-9-]+)\//);
    return match ? match[1] : undefined;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await axiosInstance.post('/chat', {
        message: input,
        moduleId: getModuleId(),
        enrollmentId: getEnrollmentId(),
        history: messages.slice(-5) // Send last 5 messages for context
      });
      
      const replyMsg: Message = { role: 'assistant', content: response.data.reply };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I am having trouble connecting right now.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!inline && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-24 right-6 p-4 rounded-full shadow-lg transition-all duration-300 z-50 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100 bg-blue-600 hover:bg-blue-700 text-white'}`}
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      <div
        className={
          inline
            ? "w-full h-full bg-white flex flex-col z-10 overflow-hidden"
            : `fixed bottom-24 right-6 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 transform origin-bottom-right z-50 border border-gray-200 overflow-hidden ${
                isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-0 opacity-0 translate-y-10 pointer-events-none'
              }`
        }
        style={inline ? {} : { height: '500px', maxHeight: 'calc(100vh - 48px)' }}
      >
        {/* Header */}
        <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Doubt Assistant
            </h3>
            <p className="text-xs text-blue-100 mt-1">Your friendly learning buddy</p>
          </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-white hover:bg-blue-700 p-1.5 rounded-lg transition-colors"
                  title="Clear Chat"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              {!inline && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-blue-700 p-1.5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-50 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-10">
              👋 Hey there! I'm your learning buddy. Ask me anything about your course materials or if you're stuck!
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white self-end rounded-tr-none'
                  : 'bg-white text-gray-800 self-start rounded-tl-none border border-gray-100'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex justify-between items-start mb-2 -mt-1 -mr-1">
                  <span className="font-semibold text-[11px] uppercase tracking-wider text-gray-400">Assistant</span>
                  <CopyButton text={msg.content} />
                </div>
              )}
              <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="bg-white text-gray-800 self-start rounded-2xl rounded-tl-none border border-gray-100 p-3 max-w-[85%] shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-gray-100 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question... (Shift+Enter for new line)"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none overflow-y-auto"
              disabled={isLoading}
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 mb-0.5"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
