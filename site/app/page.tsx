"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";

function useMetaMask() {
  const [provider, setProvider] = useState<ethers.Eip1193Provider | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [accounts, setAccounts] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    const anyWin = window as any;
    if (anyWin?.ethereum) {
      setProvider(anyWin.ethereum);
      anyWin.ethereum.request({ method: "eth_chainId" }).then((id: string) => setChainId(parseInt(id, 16)));
      anyWin.ethereum.request({ method: "eth_accounts" }).then((acc: string[]) => setAccounts(acc));
      anyWin.ethereum.on?.("chainChanged", (id: string) => setChainId(parseInt(id, 16)));
      anyWin.ethereum.on?.("accountsChanged", (acc: string[]) => setAccounts(acc));
    }
  }, []);

  const connect = () => provider?.request({ method: "eth_requestAccounts" }).then((acc: string[]) => setAccounts(acc));

  const browserProvider = useMemo(() => (provider ? new ethers.BrowserProvider(provider) : undefined), [provider]);
  const signer = useMemo(() => {
    if (!browserProvider) return undefined;
    const addr = accounts && accounts.length > 0 ? accounts[0] : undefined;
    if (!addr) return undefined;
    return new ethers.JsonRpcSigner(browserProvider, addr);
  }, [browserProvider, accounts]);

  return { provider, chainId, accounts, signer, connect };
}

async function loadRelayerUMD() {
  const url = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
  if ((window as any).relayerSDK) return true;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.type = "text/javascript";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load relayer-sdk UMD"));
    document.head.appendChild(s);
  });
  return true;
}

async function ensureLodash() {
  // 某些 UMD 版本在内部使用 lodash 的 _.map，这里确保全局 _ 可用
  const w = window as any;
  await new Promise<void>((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js";
    sc.type = "text/javascript";
    sc.onload = () => resolve();
    sc.onerror = () => reject(new Error("Failed to load lodash"));
    document.head.appendChild(sc);
  });
  if (w._ && typeof w._.map !== "function") {
    throw new Error("Loaded lodash but _.map is not a function");
  }
  return true;
}

// Add helper classes/functions from template (simplified):
class FhevmDecryptionSignature {
  publicKey!: string;
  privateKey!: string;
  signature!: string;
  contractAddresses!: `0x${string}`[];
  userAddress!: `0x${string}`;
  startTimestamp!: number;
  durationDays!: number;

  constructor(params: {
    publicKey: string;
    privateKey: string;
    signature: string;
    contractAddresses: `0x${string}`[];
    userAddress: `0x${string}`;
    startTimestamp: number;
    durationDays: number;
  }) {
    Object.assign(this, params);
  }

  static async loadOrSign(
    instance: any,
    contractAddresses: string[],
    signer: ethers.Signer
  ): Promise<FhevmDecryptionSignature | null> {
    const userAddress = await signer.getAddress() as `0x${string}`;
    const { publicKey, privateKey } = instance.generateKeypair(); // Assume instance has this
    const sortedAddresses = (contractAddresses as `0x${string}`[]).sort();
    const eip712 = instance.createEIP712(publicKey, sortedAddresses, Math.floor(Date.now() / 1000 / 86400) * 86400, 30);
    try {
      const sig = await signer.signTypedData(eip712.domain, { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification }, eip712.message);
      return new FhevmDecryptionSignature({
        publicKey,
        privateKey,
        signature: sig,
        contractAddresses: sortedAddresses,
        userAddress,
        startTimestamp: eip712.message.startTimestamp,
        durationDays: eip712.message.durationDays,
      });
    } catch (e) {
      console.error("Signature failed:", e);
      return null;
    }
  }
}

export default function Page() {
  const { provider, chainId, accounts, signer, connect } = useMetaMask();
  const [instance, setInstance] = useState<any>(undefined);
  const [fhevmStatus, setFhevmStatus] = useState<string>("未初始化");
  const [message, setMessage] = useState<string>("");
  const [registry, setRegistry] = useState<string>("");
  const [abi, setAbi] = useState<any[]>([]);
  const [ticketAddr, setTicketAddr] = useState<string>("");
  const [festivalId, setFestivalId] = useState<number>(1);
  const [ticketId, setTicketId] = useState<number | undefined>(undefined);
  const [myTickets, setMyTickets] = useState<number[]>([]);
  const [seatInput, setSeatInput] = useState<number>(7);

  useEffect(() => {
    async function loadAbi() {
      if (!chainId) return;
      const net = chainId === 11155111 ? "sepolia" : chainId === 31337 ? "localhost" : undefined;
      if (!net) return;
      try {
        const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const res = await fetch(`${BASE}/abi/${net}/FestivalRegistry.json`);
        if (res.ok) {
          const json = await res.json();
          if (json?.abi && json?.address) {
            setAbi(json.abi);
            if (!registry) setRegistry(json.address);
            if (json?.festivals?.[1]?.ticket) setTicketAddr(json.festivals[1].ticket);
          }
        }
      } catch {}
    }
    loadAbi();
  }, [chainId, registry]);

  useEffect(() => {
    async function boot() {
      try {
        if (!provider || chainId !== 11155111) {
          setFhevmStatus(chainId === 31337 ? "本地模式 (Mock)" : "等待 Sepolia");
          return;
        }
        setFhevmStatus("依赖加载中...");
        console.log("Before loading lodash: window._ exists?", !!(window as any)._, "typeof _.map:", typeof (window as any)._?.map);
        await ensureLodash();
        console.log("After loading lodash: typeof _.map:", typeof (window as any)._?.map);
        await loadRelayerUMD();
        console.log("After loading relayer UMD: typeof _.map:", typeof (window as any)._?.map);
        setFhevmStatus("SDK 初始化中...");
        const sdk = (window as any).relayerSDK;
        await sdk.initSDK();
        console.log("After sdk.initSDK: typeof _.map:", typeof (window as any)._?.map);
        setFhevmStatus("创建实例中...");
        const inst = await sdk.createInstance({
          ...sdk.SepoliaConfig,
          network: provider,
        });
        setInstance(inst);
        setFhevmStatus("✅ Relayer 实例就绪");
        setMessage("FHEVM relayer instance ready (Sepolia)");
      } catch (e: any) {
        setFhevmStatus("❌ 初始化失败");
        setMessage("FHEVM init failed: " + e?.message);
        console.error("Init error:", e);
      }
    }
    boot();
  }, [provider, chainId]);

  // 刷新“我的门票”列表（简易扫描 totalSupply/ownerOf）
  useEffect(() => {
    async function refreshMyTickets() {
      try {
        if (!provider || !ticketAddr || !accounts?.[0]) return;
        const ro = new ethers.BrowserProvider(provider);
        const erc721Abi = [
          "function totalSupply() view returns (uint256)",
          "function ownerOf(uint256 tokenId) view returns (address)",
        ];
        const t = new ethers.Contract(ticketAddr as `0x${string}`, erc721Abi, ro);
        const total: bigint = await t.totalSupply();
        const mine: number[] = [];
        const me = accounts[0].toLowerCase();
        const max = Number(total);
        for (let id = 1; id <= max; id++) {
          try {
            const owner: string = await t.ownerOf(id);
            if (owner?.toLowerCase() === me) mine.push(id);
          } catch {}
        }
        setMyTickets(mine);
        if (!ticketId && mine.length > 0) setTicketId(mine[0]);
      } catch {}
    }
    refreshMyTickets();
  }, [provider, ticketAddr, accounts, ticketId]);

  const buy = async () => {
    if (!signer || !registry || abi.length === 0) return;
    setMessage("购票中...");
    try {
      const c = new ethers.Contract(registry as `0x${string}`, abi, signer);
      const tx = await c.buyTicket(festivalId);
      setMessage(`交易已提交: ${tx.hash.slice(0, 10)}...`);
      const receipt = await tx.wait();
      try {
        // 从事件中解析最新的 tokenId
        const iface = new ethers.Interface(abi);
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = iface.parseLog({
              topics: log.topics as string[],
              data: log.data as string,
            });
            if (parsed?.name === "TicketMinted") {
              const mintedId = Number(parsed.args?.tokenId);
              if (!Number.isNaN(mintedId)) {
                setTicketId(mintedId);
              }
            }
          } catch {}
        }
      } catch {}
      setMessage("✅ 购票成功！");
    } catch (e: any) {
      setMessage("❌ 购票失败: " + e?.message);
    }
  };

  // 工具: 句柄是否全零
  const isZeroHandle = (h: string | undefined) => {
    if (!h) return true;
    if (h === ethers.ZeroHash) return true;
    return /^0x0+$/i.test(h);
  };

  // 工具: 模板式统一加密32位并返回 { handle, proof }
  const encrypt32ForContract = async (value: number | bigint) => {
    if (!instance || !signer || !registry) throw new Error("缺少实例/签名/地址");
    const v = typeof value === "number" ? BigInt(Math.trunc(Math.abs(value))) : value;
    const buffer = instance.createEncryptedInput(registry, await signer.getAddress());
    buffer.add32(v);
    const ciphertexts = await buffer.encrypt();
    const handle = ciphertexts?.handles?.[0];
    if (!handle) throw new Error("handles[0] 缺失");
    return { handle, proof: ciphertexts.inputProof } as { handle: string; proof: string };
  };

  // 工具: 模板式统一解密 (对象 → 数组 → 单值)
  const decryptPublicAnyForm = async (handleHex: string) => {
    const maybeDecryptPublic = (instance as any).decryptPublic ?? (instance as any).publicDecrypt;
    if (typeof maybeDecryptPublic !== "function") {
      throw new Error("SDK 缺少公共解密 API (decryptPublic/publicDecrypt)");
    }
    try {
      const rObj = await maybeDecryptPublic.call(instance, registry, { handles: [handleHex] });
      return Array.isArray(rObj) ? rObj[0] : rObj;
    } catch (e1) {
      try {
        const rArr = await maybeDecryptPublic.call(instance, registry, [handleHex]);
        return Array.isArray(rArr) ? rArr[0] : rArr;
      } catch (e2) {
        return await maybeDecryptPublic.call(instance, registry, handleHex);
      }
    }
  };

  const assignSeat = async () => {
    if (!instance || !signer || !registry || abi.length === 0 || !ticketId) return;
    setMessage("加密座位中...");
    try {
      if (!Number.isFinite(seatInput) || seatInput < 0 || seatInput > 0xffffffff) {
        setMessage("❌ 无效的座位号（0 ~ 4294967295）");
        return;
      }
      const { handle, proof } = await encrypt32ForContract(seatInput);
      setMessage("提交加密交易...");
      const c = new ethers.Contract(registry as `0x${string}`, abi, signer);
      const tx = await c.assignSeat(festivalId, ticketId, handle, proof);
      setMessage(`交易已提交: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      setMessage("✅ 座位分配成功（已加密）");
    } catch (e: any) {
      const msg: string = e?.message || "unknown error";
      if (/only org\/owner/i.test(msg) || /unauthorized|permission/i.test(msg)) {
        setMessage("❌ 座位分配失败: 需要主办方/合约 Owner 账户执行。");
      } else {
        setMessage("❌ 座位分配失败: " + msg);
      }
    }
  };

  const decryptSeat = async () => {
    if (!instance || !registry || !provider || abi.length === 0 || !ticketId || !signer) return;
    setMessage("解密中...");
    console.log("Before decryption: typeof _.map:", typeof (window as any)._?.map);
    try {
      const ro = new ethers.BrowserProvider(provider);
      const c = new ethers.Contract(registry as `0x${string}`, abi, ro);
      const handleRaw = await c.getSeatIndexHandle(ticketId);
      let handleHex = typeof handleRaw === "string" ? handleRaw : ethers.hexlify(handleRaw as unknown as ethers.BytesLike);

      if (isZeroHandle(handleHex)) {
        setMessage("ℹ️ 尚未分配座位，或当前地址未被授权解密。请让主办方/合约 Owner 先执行“加密分配座位”。");
        return;
      }

      const sig = await FhevmDecryptionSignature.loadOrSign(instance, [registry], signer);
      if (!sig) {
        setMessage("❌ 无法生成解密签名");
        return;
      }

      const res = await instance.userDecrypt(
        [{ handle: handleHex, contractAddress: registry }],
        sig.privateKey,
        sig.publicKey,
        sig.signature,
        sig.contractAddresses,
        sig.userAddress,
        sig.startTimestamp,
        sig.durationDays
      );

      const clear = res[handleHex];
      setMessage(`✅ 座位号: ${clear?.toString?.() ?? String(clear)}`);
    } catch (e: any) {
      const msg: string = e?.message || "unknown error";
      console.error("Decryption error:", e);
      if (msg.includes("permission") || msg.includes("not allowed") || msg.includes("denied")) {
        setMessage("❌ 解密失败: 未被授权。请确保分配座位时将本票当前持有人加入授权（主办方执行 assignSeat 后自动授权）。");
      } else {
        setMessage("❌ 解密失败: " + msg);
      }
    }
  };

  const networkName = chainId === 11155111 ? "Sepolia" : chainId === 31337 ? "Localhost" : chainId ? `Chain ${chainId}` : "未连接";

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f1a", color: "#eaeaea" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: "1px solid #1f2937" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>ChainFestival</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/passes" style={{ fontSize: 12, color: "#22d3ee", textDecoration: "none", padding: "6px 10px", border: "1px solid #164e63", borderRadius: 8 }}>我的门票</Link>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{networkName}</span>
          {!accounts?.length ? (
            <button onClick={connect} style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>连接钱包</button>
          ) : (
            <span style={{ fontSize: 12, color: "#60a5fa" }}>{accounts[0].slice(0, 6)}...{accounts[0].slice(-4)}</span>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>我的门票</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>暂无门票，先点击下方“购买门票”。</div>
          </div>

          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>操作</div>
            <div style={{ display: "grid", gap: 10 }}>
              <button onClick={buy} disabled={!signer || !registry || abi.length === 0} style={{ padding: "10px 12px", background: (!signer || !registry || abi.length === 0) ? "#374151" : "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: (!signer || !registry || abi.length === 0) ? "not-allowed" : "pointer" }}>购买门票</button>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#93c5fd", marginBottom: 4 }}>📋 操作日志</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#9ca3af" }}>{message || "等待操作..."}</div>
        </section>

        {registry && (
          <section style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
            Registry: <span style={{ color: "#93c5fd" }}>{registry}</span>
            {ticketAddr && <span> · Ticket: <span style={{ color: "#fcd34d" }}>{ticketAddr}</span></span>}
          </section>
        )}
      </main>

      <footer style={{ textAlign: "center", fontSize: 12, color: "#6b7280", padding: 16, borderTop: "1px solid #1f2937" }}>FHEVM Demo · ChainFestival</footer>
    </div>
  );
}
