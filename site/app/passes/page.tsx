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

async function ensureRelayer() {
  if ((window as any).relayerSDK) return (window as any).relayerSDK;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
    s.type = "text/javascript";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load relayer-sdk UMD"));
    document.head.appendChild(s);
  });
  const sdk = (window as any).relayerSDK;
  await sdk.initSDK();
  return sdk;
}

export default function PassesPage() {
  const { provider, chainId, accounts, signer, connect } = useMetaMask();
  const [registry, setRegistry] = useState<string>("");
  const [ticketAddr, setTicketAddr] = useState<string>("");
  const [owned, setOwned] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");
  const [instance, setInstance] = useState<any>();
  const [assigning, setAssigning] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState<number | null>(null);
  const [ticketStatus, setTicketStatus] = useState<Record<number, string>>({});

  // load registry and ticket address from public/abi
  useEffect(() => {
    async function loadDeployment() {
      if (!chainId) return;
      const net = chainId === 11155111 ? "sepolia" : chainId === 31337 ? "localhost" : undefined;
      if (!net) return;
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const res = await fetch(`${base}/abi/${net}/FestivalRegistry.json`);
        if (res.ok) {
          const json = await res.json();
          setRegistry(json?.address ?? "");
          setTicketAddr(json?.festivals?.[1]?.ticket ?? "");
        }
      } catch {}
    }
    loadDeployment();
  }, [chainId]);

  useEffect(() => {
    async function init() {
      if (!provider || chainId !== 11155111) return;
      const sdk = await ensureRelayer();
      const inst = await sdk.createInstance({
        ...sdk.SepoliaConfig,
        network: provider,
      });
      setInstance(inst);
    }
    init();
  }, [provider, chainId]);

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

  const assignSeat = async (ticketId: number) => {
    if (!instance || !signer || !registry || !ticketId) return;
    try {
      setAssigning(ticketId);
      setTicketStatus((s) => ({ ...s, [ticketId]: "加密分配进行中..." }));
      const random = Math.floor(Math.random() * 10) + 1; // 1-10
      const { handle, proof } = await encrypt32ForContract(random);
      const abi = [
        "function assignSeat(uint256,uint256,bytes32,bytes)"
      ];
      const c = new ethers.Contract(registry as `0x${string}`, abi, signer);
      const tx = await c.assignSeat(1, ticketId, handle, proof);
      await tx.wait();
      setTicketStatus((s) => ({ ...s, [ticketId]: "已分配（已加密）" }));
      setMsg(`Ticket #${ticketId} 已加密分配成功`);
    } catch (e: any) {
      setTicketStatus((s) => ({ ...s, [ticketId]: `分配失败: ${e?.message ?? "unknown"}` }));
      setMsg("分配失败: " + e?.message);
    } finally {
      setAssigning(null);
    }
  };

  const decryptSeat = async (ticketId: number) => {
    if (!instance || !registry || !provider) return;
    try {
      setDecrypting(ticketId);
      setTicketStatus((s) => ({ ...s, [ticketId]: "解密进行中..." }));
      const ro = new ethers.BrowserProvider(provider);
      const abi = [
        "function getSeatIndexHandle(uint256) view returns (bytes32)"
      ];
      const c = new ethers.Contract(registry as `0x${string}`, abi, ro);
      const handleHex: string = await c.getSeatIndexHandle(ticketId);

      const { publicKey, privateKey } = instance.generateKeypair();
      const eip712 = instance.createEIP712(publicKey, [registry], Math.floor(Date.now()/86400_000)*86400, 30);
      const sig = await signer!.signTypedData(eip712.domain, { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification }, eip712.message);
      const res = await instance.userDecrypt(
        [{ handle: handleHex, contractAddress: registry }],
        privateKey,
        publicKey,
        sig,
        [registry],
        await signer!.getAddress(),
        eip712.message.startTimestamp,
        eip712.message.durationDays
      );
      const seat = res[handleHex];
      setTicketStatus((s) => ({ ...s, [ticketId]: `座位号: ${seat}` }));
      setMsg(`Ticket #${ticketId} 座位号: ${seat}`);
    } catch (e: any) {
      setTicketStatus((s) => ({ ...s, [ticketId]: `解密失败: ${e?.message ?? "unknown"}` }));
      setMsg("解密失败: " + e?.message);
    } finally {
      setDecrypting(null);
    }
  };

  const refresh = async () => {
    if (!provider || !ticketAddr) return;
    setLoading(true);
    setMsg("加载我的门票...");
    try {
      const ro = new ethers.BrowserProvider(provider);
      const erc721Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function ownerOf(uint256) view returns (address)",
        "function totalSupply() view returns (uint256)",
      ];
      const c = new ethers.Contract(ticketAddr as `0x${string}`, erc721Abi, ro);
      const total: bigint = await c.totalSupply();
      const me = accounts?.[0]?.toLowerCase();
      const mine: number[] = [];
      for (let i = 1n; i <= total; i++) {
        try {
          const owner: string = await c.ownerOf(i);
          if (owner.toLowerCase() === me) {
            mine.push(Number(i));
          }
        } catch {}
      }
      setOwned(mine);
      setMsg(mine.length ? `找到 ${mine.length} 张门票` : "暂无门票");
    } catch (e: any) {
      setMsg("加载失败: " + e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketAddr && accounts?.length) {
      refresh();
    }
  }, [ticketAddr, accounts]);

  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #0f0c29 100%)", color: "#e0e0e0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/" style={{ color: "#22d3ee" }}>返回首页</Link>
          <h1 style={{ fontSize: "2rem" }}>我的门票</h1>
        </div>
        {!accounts?.length ? (
          <button onClick={connect} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#6a5acd", color: "#fff" }}>连接钱包</button>
        ) : (
          <div style={{ color: "#00d4ff" }}>{accounts[0].slice(0,6)}...{accounts[0].slice(-4)}</div>
        )}
      </header>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#a0a0a0" }}>Registry: {registry || "-"}</div>
        <div style={{ fontSize: 14, color: "#a0a0a0" }}>Ticket NFT: {ticketAddr || "-"}</div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <button onClick={refresh} disabled={!ticketAddr || !accounts?.length || loading} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: loading ? "#444" : "#00d4ff", color: "#001" }}>刷新</button>
      </section>

      <div style={{ marginBottom: 16, color: "#b0b0b0" }}>{msg}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {owned.map((id) => (
          <div key={id} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#888" }}>Festival #1</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>Ticket #{id}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => assignSeat(id)}
                disabled={!instance || !accounts?.length || assigning === id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "none",
                  background: assigning === id ? "#475569" : instance ? "#06b6d4" : "#444",
                  color: assigning === id ? "#cbd5e1" : "#001",
                  cursor: assigning === id ? "wait" : "pointer",
                }}
              >
                {assigning === id ? "加密中..." : (ticketStatus[id]?.startsWith("已分配") ? "已分配" : "加密分配(1-10)")}
              </button>
              <button
                onClick={() => decryptSeat(id)}
                disabled={!instance || !accounts?.length || decrypting === id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "none",
                  background: decrypting === id ? "#6b7280" : instance ? "#a855f7" : "#444",
                  color: "#fff",
                  cursor: decrypting === id ? "wait" : "pointer",
                }}
              >
                {decrypting === id ? "解密中..." : (ticketStatus[id]?.startsWith("座位号") ? "已解密" : "解密座位")}
              </button>
            </div>
            {ticketStatus[id] && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>{ticketStatus[id]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
