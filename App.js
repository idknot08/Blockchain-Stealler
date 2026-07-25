import React, { useEffect, useState } from "react";
import "./App.css";

import {
  SorobanRpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";

import * as freighterApi from "@stellar/freighter-api";

const CONTRACT_ID =
  "CDNHTFCHBDBDFZFTVRR6YERBFMZ3NR7DS57T6SXO667LXXA6PWERDLJP";

const rpc = new SorobanRpc.Server(
  "https://soroban-testnet.stellar.org"
);

const contract = new Contract(CONTRACT_ID);

export default function App() {
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("0");

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const connectWallet = async () => {
    try {
      const result =
        await freighterApi.requestAccess();

      const address =
        result.address ||
        result.publicKey;

      if (!address) {
        throw new Error(
          "Cannot get wallet address"
        );
      }

      setWallet(address);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const getBalance = async () => {
    if (!wallet) return;

    try {
      const account =
        await rpc.getAccount(wallet);

      const tx =
        new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase:
            Networks.TESTNET,
        })
          .addOperation(
            contract.call(
              "balance",
              nativeToScVal(wallet, {
                type: "address",
              })
            )
          )
          .setTimeout(30)
          .build();

      const sim =
        await rpc.simulateTransaction(
          tx
        );

      if (
        sim.result &&
        sim.result.retval
      ) {
        const value =
          scValToNative(
            sim.result.retval
          );

        setBalance(
          value.toString()
        );
      }
    } catch (err) {
      console.error(
        "Balance Error:",
        err
      );
    }
  };

  const handleSend = async (
    e
  ) => {
    e.preventDefault();

    try {
      setError("");
      setSuccess("");

      if (
        !wallet ||
        !to ||
        !amount
      ) {
        throw new Error(
          "Missing input"
        );
      }

      setStatus(
        "Preparing transaction..."
      );

      const account =
        await rpc.getAccount(wallet);

      const tx =
        new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase:
            Networks.TESTNET,
        })
          .addOperation(
            contract.call(
              "transfer",
              nativeToScVal(wallet, {
                type: "address",
              }),
              nativeToScVal(to, {
                type: "address",
              }),
              nativeToScVal(
                amount.toString(),
                {
                  type: "i128",
                }
              )
            )
          )
          .setTimeout(30)
          .build();

      setStatus(
        "Simulating..."
      );

      const sim =
        await rpc.simulateTransaction(
          tx
        );

      console.log(
        "Transfer Simulation:",
        sim
      );

      if (
        !SorobanRpc.Api.isSimulationSuccess(
          sim
        )
      ) {
        throw new Error(
          "Simulation failed"
        );
      }

      let assembled =
        SorobanRpc.assembleTransaction(
          tx,
          sim
        );

      let txForSigning =
        typeof assembled.build ===
        "function"
          ? assembled.build()
          : assembled;

      setStatus(
        "Waiting for signature..."
      );

      const signed =
        await freighterApi.signTransaction(
          txForSigning.toXDR(),
          {
            networkPassphrase:
              Networks.TESTNET,
          }
        );

      const signedXdr =
        signed.signedTxXdr ||
        signed;

      const signedTx =
        TransactionBuilder.fromXDR(
          signedXdr,
          Networks.TESTNET
        );

      setStatus(
        "Submitting..."
      );

      const sendResult =
        await rpc.sendTransaction(
          signedTx
        );

      console.log(
        "Send Result:",
        sendResult
      );

      setSuccess(
        `Transaction submitted:
${sendResult.hash}`
      );

      setAmount("");
      setTo("");

      setTimeout(() => {
        getBalance();
      }, 5000);
    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "Transfer failed"
      );
    } finally {
      setStatus("");
    }
  };

  useEffect(() => {
    connectWallet();
  }, []);

  useEffect(() => {
    if (wallet) {
      getBalance();
    }
  }, [wallet]);

return (
    <div className="app-container">
      <h1 className="gradient-text">Soroban Token dApp</h1>

      <div className="info-section">
        <p>Wallet: <span>{wallet || "Not connected"}</span></p>
        <p>Balance: <span>{balance} DMT</span></p>
      </div>

      <div className="card">
        <h2 className="card-title">Send Tokens</h2>

        <form onSubmit={handleSend} className="send-form">
          <input
            className="custom-input"
            type="text"
            placeholder="To Address"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          <input
            className="custom-input"
            type="number"
            placeholder="Value"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <button className="gradient-btn" type="submit" disabled={!!status}>
            Send
          </button>
        </form>

        {/* Phần hiển thị trạng thái và lỗi */}
        <div className="status-messages">
          {status && <p className="status-text"><b>Status:</b> {status}</p>}
          {success && <p className="success-text">{success}</p>}
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    </div>
  );
}
