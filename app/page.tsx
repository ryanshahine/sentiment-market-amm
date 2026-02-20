'use client';

import { useMemo, useState, useEffect } from 'react';
import { formatEther, parseEther, type Hash } from 'viem';
import {
  useAccount,
  useChainId,
  useConnect,
  useReadContract,
  useWatchContractEvent,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useDisconnect,
} from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { sentimentAbi } from '../lib/abi';
import { CONTRACT_ADDRESS } from '../lib/wagmi';

// --- Utils ---

function formatPrice(raw?: bigint) {
  if (!raw) return '-';
  return (Number(raw) / 1e18).toFixed(4);
}

function formatEth(raw?: bigint) {
  if (!raw) return '-';
  return Number(formatEther(raw)).toFixed(4);
}

function formatIndex(raw?: bigint) {
  if (!raw) return '-';
  return Number(raw).toFixed(0);
}

function safeParseEther(value: string) {
  try {
    return parseEther(value || '0');
  } catch {
    return undefined;
  }
}

// --- Components ---

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const [showConnectors, setShowConnectors] = useState(false);
  const chainId = useChainId();
  const { switchChain, error: switchError, status: switchStatus } = useSwitchChain();

  // --- State ---
  // Removed tradeMode, now we have separate sections
  const [tradeDirection, setTradeDirection] = useState<'long' | 'short'>('long');
  const [tradeAmount, setTradeAmount] = useState('0.1');
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);
  const [displaySentiment, setDisplaySentiment] = useState<number | null>(null);
  const [sentimentBlink, setSentimentBlink] = useState<'green' | 'red' | null>(null);

  // Close state
  const [closeAmountLong, setCloseAmountLong] = useState('');
  const [closeAmountShort, setCloseAmountShort] = useState('');

  const [txHash, setTxHash] = useState<Hash | undefined>();

  // Live updates
  const [livePrice, setLivePrice] = useState<bigint | undefined>();

  // Mock Data
  const [comments, setComments] = useState(
    () =>
      [
        {
          id: 1,
          user: 'azunyan',
          text: 'AI will win, thank me later.',
          tag: 'Artificial Intelligence',
          ts: Date.now() - 1000 * 60 * 2,
        },
        {
          id: 2,
          user: 'ChillOJ',
          text: 'Altman was robbed in 2023.',
          tag: 'Sam Altman',
          ts: Date.now() - 1000 * 60 * 8,
        },
        {
          id: 3,
          user: 'ElephantOfEpsilo...',
          text: "Lebron's taking the spotlight again.",
          tag: 'Taylor Swift',
          ts: Date.now() - 1000 * 60 * 20,
        },
      ] as { id: number; user: string; text: string; tag?: string; ts: number }[],
  );
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'holders' | 'activity' | 'position'>('comments');
  const [activity, setActivity] = useState<{ id: number; text: string; ago: string }[]>([]);

  const holdingsLong = [
    { user: 'goingsocial', amount: 179_703 },
    { user: 'WHAEL', amount: 137_320 },
    { user: 'polywog', amount: 101_933 },
    { user: 'TeamGG', amount: 93_000 },
    { user: 'Andronicos', amount: 37_109 },
  ];

  const holdingsShort = [
    { user: 'EscalateFund', amount: 42_792 },
    { user: 'forinnerpsandr1x11222', amount: 39_458 },
    { user: 'dumbass2', amount: 38_971 },
    { user: 'Haskronn', amount: 18_124 },
    { user: 'annoyingamy', amount: 18_019 },
  ];

  const sparkline = [0.48, 0.5, 0.46, 0.52, 0.55, 0.51, 0.5, 0.53, 0.57, 0.54];

  // --- Fetch ETH/USD Price ---
  useEffect(() => {
    async function fetchEthPrice() {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        setEthUsdPrice(data.ethereum.usd);
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
      }
    }
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // --- Contract Reads ---

  const { data: price } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'price',
    query: { refetchInterval: 5_000 },
  });

  const { data: longExposure } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'longExposure',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const { data: shortExposure } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'shortExposure',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const { data: avgLongEntry } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'avgLongEntry',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const { data: avgShortEntry } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'avgShortEntry',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const { data: totalLongVolume } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'totalLongVolume',
    query: { refetchInterval: 10_000 },
  });

  const { data: totalShortVolume } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'totalShortVolume',
    query: { refetchInterval: 10_000 },
  });

  // --- Previews ---

  const parsedAmount = safeParseEther(tradeAmount);
  const parsedCloseLong = safeParseEther(closeAmountLong);
  const parsedCloseShort = safeParseEther(closeAmountShort);

  const { data: previewLongOpen } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'previewLongOpen',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: Boolean(parsedAmount) && tradeDirection === 'long' },
  });

  const { data: previewShortOpen } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'previewShortOpen',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: Boolean(parsedAmount) && tradeDirection === 'short' },
  });

  const { data: previewLongClose } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'previewLongClose',
    args: parsedCloseLong ? [parsedCloseLong] : undefined,
    query: { enabled: Boolean(parsedCloseLong) },
  });

  const { data: previewShortClose } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    functionName: 'previewShortClose',
    args: parsedCloseShort ? [parsedCloseShort] : undefined,
    query: { enabled: Boolean(parsedCloseShort) },
  });

  // --- Writes ---

  const { writeContractAsync, isPending: isWriting, error: writeError } = useWriteContract();

  const {
    isLoading: isWaiting,
    isSuccess: isConfirmed,
    error: waitError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  // --- Event Watching ---

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: sentimentAbi,
    eventName: 'PriceUpdate',
    onLogs: (logs) => {
      const latest = logs.at(-1) as { args?: { price?: bigint } } | undefined;
      if (latest?.args?.price) {
        setLivePrice(latest.args.price);
        const p = Number(latest.args.price) / 1e18;
        setActivity((prev) =>
          [{ id: Date.now(), text: `Price updated to ${p.toFixed(4)}`, ago: 'now' }, ...prev].slice(0, 20),
        );
      }
    },
  });

  // --- Derived Values ---

  const displayPrice = livePrice ?? price;
  const priceVal = displayPrice ? Number(displayPrice) / 1e18 : undefined;
  const sentimentIndex = priceVal ? Math.round(priceVal * 100) : undefined;

  // Animate sentiment on load only when page is loaded and visible
  useEffect(() => {
    if (sentimentIndex === undefined) return;
    if (document.hidden) return; // Don't animate if tab is not visible
    if (document.readyState !== 'complete') return; // Wait for page to fully load
    
    if (sentimentIndex >= 50) {
      // Going up - blink green
      setDisplaySentiment(sentimentIndex - 1);
      const timer = setTimeout(() => {
        setDisplaySentiment(sentimentIndex);
        setSentimentBlink('green');
        setTimeout(() => setSentimentBlink(null), 500);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Going down - blink red
      setDisplaySentiment(sentimentIndex + 1);
      const timer = setTimeout(() => {
        setDisplaySentiment(sentimentIndex);
        setSentimentBlink('red');
        setTimeout(() => setSentimentBlink(null), 500);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [sentimentIndex]);

  const longExpVal = longExposure ? Number(formatEther(longExposure)) : 0;
  const shortExpVal = shortExposure ? Number(formatEther(shortExposure)) : 0;

  const avgLongVal = avgLongEntry ? Number(formatEther(avgLongEntry)) : 0;
  const avgShortVal = avgShortEntry ? Number(formatEther(avgShortEntry)) : 0;

  const longPnL = priceVal && avgLongVal && longExpVal ? (priceVal - avgLongVal) * longExpVal : 0;

  const shortPnL = priceVal && avgShortVal && shortExpVal ? (avgShortVal - priceVal) * shortExpVal : 0;

  // --- Handlers ---

  async function handleOpen() {
    if (!parsedAmount) return;
    setTxHash(undefined);

    try {
      if (tradeDirection === 'long') {
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: sentimentAbi,
          functionName: 'goLong',
          value: parsedAmount,
        });
        setTxHash(hash);
      } else {
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: sentimentAbi,
          functionName: 'goShort',
          value: parsedAmount,
        });
        setTxHash(hash);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCloseLong() {
    if (!parsedCloseLong) return;
    setTxHash(undefined);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: sentimentAbi,
        functionName: 'closeLong',
        args: [parsedCloseLong],
      });
      setTxHash(hash);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCloseShort() {
    if (!parsedCloseShort) return;
    setTxHash(undefined);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: sentimentAbi,
        functionName: 'closeShort',
        args: [parsedCloseShort],
      });
      setTxHash(hash);
    } catch (e) {
      console.error(e);
    }
  }

  const isBusy = isWriting || isWaiting;
  const wrongNetwork = chainId !== undefined && chainId !== baseSepolia.id;
  const primaryError = writeError || waitError;

  // --- Render ---

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900 font-sans">
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-6 pb-20 pt-5 sm:px-8">
        {/* Header */}
        <header className="flex items-center justify-between rounded-full bg-white border border-slate-200 shadow-sm px-5 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
            </div>
            <h1 className="text-base font-semibold tracking-normal text-slate-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif', letterSpacing: '-0.01em' }}>Sentiment</h1>
          </div>
          <div className="relative">
            {!isConnected ? (
              <>
                <button
                  onClick={() => setShowConnectors(!showConnectors)}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Connect
                </button>
                {showConnectors && (
                  <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                    {connectors.map((c) => (
                      <button
                        key={c.uid}
                        onClick={() => {
                          connect({ connector: c });
                          setShowConnectors(false);
                        }}
                        className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-50"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => disconnect()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </button>
            )}
          </div>
        </header>

        {/* Network Warning */}
        {wrongNetwork && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Wrong network</p>
                <p className="text-amber-800">Switch to Base Sepolia</p>
              </div>
              <button
                onClick={() => switchChain({ chainId: baseSepolia.id })}
                disabled={switchStatus === 'pending'}
                className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Switch
              </button>
            </div>
          </div>
        )}

        {/* Main Content - Unified Card */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {/* Profile Header with Sentiment */}
          <div className="p-6 pb-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Sentiment Index</p>
                <h2 className={`text-5xl font-bold transition-all duration-500 ${
                  sentimentBlink === 'green' ? 'text-emerald-500' : 
                  sentimentBlink === 'red' ? 'text-rose-500' : 
                  'text-slate-900'
                }`}>
                  {displaySentiment ?? sentimentIndex ?? '-'}
                  <span className="ml-1.5 text-2xl font-normal text-slate-400">/ 100</span>
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                <img 
                  src="https://pbs.twimg.com/profile_images/1879556312822120448/QngrqCSC_400x400.jpg" 
                  alt="Jesse Pollak"
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-bold text-slate-900">jesse.base.eth</span>
                    <svg viewBox="0 0 22 22" className="w-4 h-4 text-blue-500 fill-current flex-shrink-0">
                      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"></path>
                    </svg>
                    <img 
                      src="https://pbs.twimg.com/profile_images/1945608199500910592/rnk6ixxH_400x400.jpg" 
                      alt="Base"
                      className="w-4 h-4 rounded border border-slate-300 flex-shrink-0"
                    />
                  </div>
                  <p className="text-xs text-slate-400">@jessepollak</p>
                </div>
              </div>
            </div>
          </div>

          <div className="h-64 w-full outline-none" tabIndex={-1}>
            <Sparkline data={sparkline} />
          </div>

          {/* LIVE Indicator & Volume Stats */}
          <div className="px-6 py-3 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
              </div>
              <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Live</span>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-500">Volume:</span>
                <span className="font-semibold text-slate-900">
                  {totalLongVolume && totalShortVolume
                    ? Math.round(Number(formatEth(totalLongVolume)) + Number(formatEth(totalShortVolume)))
                    : '0'}
                </span>
                <span className="text-xs text-slate-500">ETH</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-500">Long:</span>
                <span className="font-semibold text-slate-900">
                  {totalLongVolume ? Math.round(Number(formatEth(totalLongVolume))) : '0'}
                </span>
                <span className="text-xs text-slate-500">ETH</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-500">Short:</span>
                <span className="font-semibold text-slate-900">
                  {totalShortVolume ? Math.round(Number(formatEth(totalShortVolume))) : '0'}
                </span>
                <span className="text-xs text-slate-500">ETH</span>
              </div>
            </div>
          </div>

          {/* Trading Interface */}
          <div className="p-6">
            {/* Direction Toggle */}
            <div className="relative inline-flex rounded-2xl bg-slate-100 p-1 mb-6 w-full">
              <div
                className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-xl shadow-md transition-all duration-500 ease-in-out ${
                  tradeDirection === 'long' ? 'left-1 bg-emerald-500' : 'left-[calc(50%+4px)] bg-rose-500'
                }`}
              />
              <button
                onClick={() => setTradeDirection('long')}
                className={`relative z-10 flex-1 flex items-center justify-center rounded-xl py-3 px-4 transition-colors duration-300 font-bold text-base ${
                  tradeDirection === 'long' ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Long {displaySentiment ?? sentimentIndex ?? '-'}¢
              </button>
              <button
                onClick={() => setTradeDirection('short')}
                className={`relative z-10 flex-1 flex items-center justify-center rounded-xl py-3 px-4 transition-colors duration-300 font-bold text-base ${
                  tradeDirection === 'short' ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Short {displaySentiment ?? sentimentIndex ? 100 - (displaySentiment ?? sentimentIndex) : '-'}¢
              </button>
            </div>

            {/* Input & Previews */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border-2 border-slate-200 px-5 py-5">
                <div className="flex items-start justify-between mb-2">
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Amount</label>
                  <div className="flex items-center gap-2">
                    <img src="/eth.png" alt="ETH" className="w-6 h-6" />
                    <span className="text-slate-900 font-semibold text-sm">ETH</span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <input
                    type="text"
                    inputMode="decimal"
                    min="0"
                    value={tradeAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Only allow numbers and a single decimal point
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        setTradeAmount(value);
                      }
                    }}
                    className="flex-1 bg-transparent text-5xl font-medium text-slate-900 outline-none placeholder:text-slate-300"
                    placeholder="0"
                  />
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  ${ethUsdPrice && tradeAmount ? (ethUsdPrice * parseFloat(tradeAmount)).toFixed(2) : '0.00'}
                </div>
              </div>

              <button
                onClick={handleOpen}
                disabled={!isConnected || isBusy || wrongNetwork}
                className={`w-full rounded-xl px-4 py-4 text-center text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  tradeDirection === 'long'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isBusy ? 'Processing…' : tradeDirection === 'long' ? 'Long @jessepollak' : 'Short @jessepollak'}
              </button>
            </div>
          </div>
        </section>

        {/* Status Messages */}
        {(isWaiting || isConfirmed || primaryError) && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            {isWaiting && <p className="text-sm text-slate-500">Waiting for confirmation…</p>}
            {isConfirmed && <p className="text-sm text-emerald-600">Transaction confirmed.</p>}
            {primaryError && <p className="text-sm text-rose-600">{primaryError.message}</p>}
          </section>
        )}

        {/* Social / Info */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-4 border-b border-slate-200 pb-3">
            <TabButton active={activeTab === 'comments'} onClick={() => setActiveTab('comments')}>
              Comments
            </TabButton>
            <TabButton active={activeTab === 'holders'} onClick={() => setActiveTab('holders')}>
              Holders
            </TabButton>
            <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
              Activity
            </TabButton>
            <TabButton active={activeTab === 'position'} onClick={() => setActiveTab('position')}>
              Your Position
            </TabButton>
          </div>

          {activeTab === 'position' && (
            <div className="mt-4 min-h-[300px]">
              {longExpVal === 0 && shortExpVal === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                  <p className="text-sm text-slate-500">You have no open positions.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Close Long */}
                  {longExpVal > 0 && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-emerald-800">Close Long Position</span>
                        <span className="text-xs font-medium text-emerald-600">Avail: {longExpVal.toFixed(4)} ETH</span>
                      </div>

                      <div className="mb-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400">
                        <div className="flex justify-between">
                          <label className="text-[11px] uppercase tracking-wide text-slate-500">Amount to Close</label>
                          <button
                            onClick={() => setCloseAmountLong(longExpVal.toString())}
                            className="text-[10px] font-semibold text-emerald-600 hover:underline"
                          >
                            MAX
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={longExpVal}
                          value={closeAmountLong}
                          onChange={(e) => setCloseAmountLong(e.target.value)}
                          className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                          placeholder="0.00"
                        />
                      </div>

                      {parsedCloseLong && (
                        <div className="mb-3 space-y-2">
                          <PreviewRow
                            label="Est. Exit Price"
                            value={previewLongClose ? formatPrice((previewLongClose as any)[1]) : '-'}
                          />
                          <PreviewRow
                            label="You Receive"
                            value={previewLongClose ? `${formatEth((previewLongClose as any)[0])} ETH` : '-'}
                          />
                        </div>
                      )}

                      <button
                        onClick={handleCloseLong}
                        disabled={!isConnected || isBusy || wrongNetwork || !parsedCloseLong}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {isBusy ? 'Processing…' : 'Close Long'}
                      </button>
                    </div>
                  )}

                  {/* Close Short */}
                  {shortExpVal > 0 && (
                    <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-rose-800">Close Short Position</span>
                        <span className="text-xs font-medium text-rose-600">Avail: {shortExpVal.toFixed(4)} ETH</span>
                      </div>

                      <div className="mb-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 focus-within:border-rose-400 focus-within:ring-1 focus-within:ring-rose-400">
                        <div className="flex justify-between">
                          <label className="text-[11px] uppercase tracking-wide text-slate-500">Amount to Close</label>
                          <button
                            onClick={() => setCloseAmountShort(shortExpVal.toString())}
                            className="text-[10px] font-semibold text-rose-600 hover:underline"
                          >
                            MAX
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={shortExpVal}
                          value={closeAmountShort}
                          onChange={(e) => setCloseAmountShort(e.target.value)}
                          className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                          placeholder="0.00"
                        />
                      </div>

                      {parsedCloseShort && (
                        <div className="mb-3 space-y-2">
                          <PreviewRow
                            label="Est. Exit Price"
                            value={previewShortClose ? formatPrice((previewShortClose as any)[1]) : '-'}
                          />
                          <PreviewRow
                            label="You Receive"
                            value={previewShortClose ? `${formatEth((previewShortClose as any)[0])} ETH` : '-'}
                          />
                        </div>
                      )}

                      <button
                        onClick={handleCloseShort}
                        disabled={!isConnected || isBusy || wrongNetwork || !parsedCloseShort}
                        className="w-full rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        {isBusy ? 'Processing…' : 'Close Short'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="mt-4 min-h-[300px] space-y-4">
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment"
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <button
                  onClick={() => {
                    if (!newComment.trim()) return;
                    setComments((prev) => [
                      {
                        id: Date.now(),
                        user: address ? address.slice(0, 8) : 'anon',
                        text: newComment.trim(),
                        ts: Date.now(),
                      },
                      ...prev,
                    ]);
                    setNewComment('');
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Post
                </button>
              </div>
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{c.user}</span>
                      <span className="text-xs text-slate-500">{timeAgo(c.ts)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'holders' && (
            <div className="mt-4 min-h-[300px] grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Holders title="Long Holders" data={holdingsLong} accent="emerald" />
              <Holders title="Short Holders" data={holdingsShort} accent="rose" />
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="mt-4 min-h-[300px] space-y-3">
              {activity.length === 0 && <p className="text-sm text-slate-500">No recent activity.</p>}
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                >
                  <span>{a.text}</span>
                  <span className="text-xs text-slate-500">{a.ago}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// --- Subcomponents ---

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function Holders({ title, data, accent }: { title: string; data: { user: string; amount: number }[]; accent: 'emerald' | 'rose' }) {
  const isLong = accent === 'emerald';
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600">
          {data.length} {data.length === 1 ? 'Holder' : 'Holders'}
        </div>
      </div>
      <div className="space-y-2">
        {data.map((h, idx) => (
          <div
            key={h.user}
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 bg-slate-200 text-slate-700">
                {idx + 1}
              </div>
              <span className="font-semibold text-slate-900 truncate">{h.user}</span>
            </div>
            <span className="font-bold text-sm flex-shrink-0 text-slate-900">
              {h.amount.toFixed(4)} <span className="text-xs font-semibold text-slate-500">ETH</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;

  const chartData = data.map((val, i) => ({
    index: i,
    value: val,
  }));

  const off = 0.5;

  return (
    <div className="h-64 w-full select-none [&_*]:outline-none [&_*]:focus:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{
            top: 10,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset={off} stopColor="#10b981" stopOpacity={1} />
              <stop offset={off} stopColor="#ef4444" stopOpacity={1} />
            </linearGradient>
            <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={off} stopColor="#10b981" stopOpacity={0.2} />
              <stop offset={off} stopColor="#ef4444" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="index" hide />
          <YAxis domain={[0, 1]} hide />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value: number) => [value.toFixed(2), 'Sentiment']}
            labelFormatter={() => ''}
          />
          <ReferenceLine y={0.5} stroke="#94a3b8" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="value"
            stroke="url(#splitColor)"
            fill="url(#splitFill)"
            strokeWidth={3}
            baseValue={0.5}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
