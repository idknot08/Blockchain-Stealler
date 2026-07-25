# Hướng dẫn: Xây dựng Token dApp trên Stellar/Soroban (Kali Linux)

Bài này đi từ con số 0: cài môi trường → viết smart contract → deploy lên testnet → mint token → xây giao diện web kết nối Freighter wallet. Mỗi bước có giải thích khái niệm kèm theo để hiểu *vì sao* làm vậy, không chỉ chép lệnh.

---

## Phần 0 — Vài khái niệm cần nắm trước

| Thuật ngữ | Hiểu đơn giản là gì |
|---|---|
| **Soroban** | Tên nền tảng smart contract của Stellar (giống Stellar có "EVM" riêng) |
| **Testnet** | Mạng Stellar dùng để thử nghiệm, tiền không có giá trị thật |
| **Contract ID** | Địa chỉ của smart contract sau khi deploy (bắt đầu bằng `C...`) |
| **Account/Wallet address** | Địa chỉ ví của một người dùng (bắt đầu bằng `G...`) |
| **Freighter** | Extension trình duyệt = "MetaMask của Stellar", giữ private key và ký giao dịch |
| **`invoke`** | Lệnh gọi 1 hàm trong smart contract đã deploy |
| **Mint** | Hàm tự viết để "tạo ra" token mới, cộng vào balance của 1 địa chỉ |
| **RPC (Soroban RPC)** | Server trung gian giúp web app nói chuyện với blockchain |

Điểm quan trọng nhất cần nhớ: **contract bạn đang dùng KHÔNG phải token chuẩn của Stellar (SEP-41)**. Đây là contract tự viết tay (`TokenContract`) với 3 hàm: `mint`, `balance`, `transfer`. Vì là tự viết, ai cũng mint được, không có giới hạn cung — phù hợp học tập, không dùng cho thật.

---

## Phần 1 — Cài đặt môi trường trên Kali Linux

### 1.1 Cài Rust

Soroban contract viết bằng Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.bashrc
rustc --version
```

### 1.2 Cài target WebAssembly

Contract Rust được compile ra file `.wasm` (WebAssembly) để blockchain chạy được:

```bash
rustup target add wasm32v1-none
```

### 1.3 Cài build tools

```bash
sudo apt update && sudo apt install -y build-essential
```

### 1.4 Cài Stellar CLI

```bash
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
stellar --version
```

---

## Phần 2 — Tạo và viết smart contract

### 2.1 Khởi tạo project

```bash
mkdir token-dapp && cd token-dapp
stellar contract init token-project
cd token-project
```

Lệnh này tạo sẵn khung project tại `contracts/hello-world/`.

### 2.2 Viết logic contract

File: `contracts/hello-world/src/lib.rs`

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Balance(Address),
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let key = DataKey::Balance(to.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(balance + amount));
    }

    pub fn balance(env: Env, user: Address) -> i128 {
        let key = DataKey::Balance(user);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        from.require_auth();

        let from_key = DataKey::Balance(from.clone());
        let to_key = DataKey::Balance(to.clone());

        let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }

        let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);

        env.storage().persistent().set(&from_key, &(from_balance - amount));
        env.storage().persistent().set(&to_key, &(to_balance + amount));
    }
}
```

**Giải thích logic:**

- `DataKey::Balance(Address)` — đây là "khóa" để lưu dữ liệu trên blockchain. Mỗi địa chỉ ví có 1 ô lưu trữ riêng chứa số dư của nó.
- `env.storage().persistent()` — bộ nhớ lưu trữ vĩnh viễn trên blockchain (khác với bộ nhớ tạm trong RAM).
- `mint` — không kiểm tra ai gọi, ai cũng mint được cho bất kỳ ai. (Trong thực tế cần thêm kiểm tra quyền admin, nhưng bản học tập này bỏ qua để đơn giản.)
- `transfer` — có `from.require_auth()`, nghĩa là chỉ chủ sở hữu địa chỉ `from` mới ký được giao dịch chuyển tiền từ chính họ. Đây là lý do khi bấm "Send" trên web, Freighter sẽ hiện popup xin ký.

---

## Phần 3 — Build và deploy lên Testnet

### 3.1 Tạo tài khoản Stellar (nếu chưa có)

```bash
stellar keys generate alice --network testnet --fund
```

`--fund` tự động nạp XLM test (qua dịch vụ Friendbot) để tài khoản `alice` có tiền trả phí giao dịch.

Xem địa chỉ:

```bash
stellar keys address alice
```

### 3.2 Build contract

```bash
cargo build --target wasm32v1-none --release
```

File `.wasm` sẽ nằm ở `target/wasm32v1-none/release/hello_world.wasm`.

> **Lưu ý quan trọng:** mỗi lần sửa file `lib.rs`, bạn **phải build lại** rồi **deploy lại**. Blockchain chỉ chạy bytecode đã compile, không tự đọc file `.rs`.

### 3.3 Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/hello_world.wasm \
  --source-account alice \
  --network testnet \
  --alias hello_world
```

Output sẽ trả về **Contract ID** — chuỗi bắt đầu bằng `C...`. Copy lại, đây là địa chỉ contract dùng cho mọi lệnh sau.

(Flag `--alias hello_world` giúp gọi bằng tên thay vì phải nhớ ID dài.)

---

## Phần 4 — Mint token bằng CLI

Đây chính là bước "gửi tiền" bạn nhắc tới — thực chất là **mint token tự tạo vào một địa chỉ ví**, không phải gửi XLM thật.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account alice \
  --network testnet \
  --send=yes \
  -- \
  mint \
  --to <ĐỊA_CHỈ_VÍ_NHẬN> \
  --amount 1000000
```

**Phân tích từng phần:**

| Phần | Ý nghĩa |
|---|---|
| `--id` | Contract ID vừa deploy ở Phần 3.3 |
| `--source-account alice` | Ai trả phí & ký giao dịch gọi hàm này |
| `--send=yes` | Thực sự gửi lên blockchain (không chỉ simulate) |
| `-- mint` | Gọi hàm `mint` trong contract |
| `--to` | Địa chỉ ví **nhận** token (ví dụ địa chỉ Freighter của bạn) |
| `--amount` | Số lượng token mint ra |

Vì hàm `mint` không kiểm tra quyền, **ai có CLI cũng mint được cho bất kỳ ai** — đây là điểm cần hiểu rõ để không nhầm là tính năng bảo mật.

Kiểm tra số dư sau khi mint:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account alice \
  --network testnet \
  -- \
  balance \
  --user <ĐỊA_CHỈ_VÍ>
```

---

## Phần 5 — Cài Freighter và lấy địa chỉ ví

1. Cài extension **Freighter** trên Chrome/Firefox từ trang chính thức [freighter.app](https://www.freighter.app/).
2. Tạo wallet mới (Freighter sẽ cho 1 seed phrase — lưu lại an toàn).
3. Trong Freighter, chuyển network từ **Mainnet** sang **Testnet** (góc trên, có dropdown chọn network).
4. Copy địa chỉ ví (bắt đầu bằng `G...`).
5. Dùng địa chỉ đó làm `--to` ở lệnh mint Phần 4 để tự mint token vào ví của chính mình.

> Nếu muốn ví có XLM thật (testnet) để trả phí giao dịch khi bấm "Send" trên web, vào Friendbot nạp: `https://friendbot.stellar.org/?addr=<ĐỊA_CHỈ_VÍ>`

---

## Phần 6 — Xây giao diện web (React) kết nối Freighter

### 6.1 Tạo project React

```bash
npx create-react-app stellar-token-dapp
cd stellar-token-dapp
npm install @stellar/stellar-sdk@12.3.0
npm install @stellar/freighter-api@5.0.0
```

### 6.2 Cấu trúc App.js — giải thích từng phần

App bạn đã viết làm đúng 3 việc:

**a) Kết nối Freighter:**

```javascript
const result = await freighterApi.requestAccess();
const address = result.address || result.publicKey;
```

→ Mở popup Freighter xin quyền truy cập, lấy về địa chỉ ví đang active.

**b) Đọc số dư (gọi hàm `balance` — chỉ đọc, không cần ký):**

```javascript
const sim = await rpc.simulateTransaction(tx);
```

→ Dùng `simulateTransaction` vì đây chỉ là **đọc dữ liệu**, không cần ghi lên blockchain nên không cần phí, không cần ký.

**c) Chuyển token (gọi hàm `transfer` — cần ký vì có ghi dữ liệu):**

Luồng chuẩn của một giao dịch ghi dữ liệu lên Soroban:

```
build transaction → simulate → assemble → ký bằng Freighter → gửi lên RPC
```

```javascript
const sim = await rpc.simulateTransaction(tx);
let assembled = SorobanRpc.assembleTransaction(tx, sim);
const signed = await freighterApi.signTransaction(txForSigning.toXDR(), {...});
const sendResult = await rpc.sendTransaction(signedTx);
```

Vì hàm `transfer` có `from.require_auth()` trong contract, Freighter sẽ bật popup yêu cầu bạn xác nhận ký trước khi gửi.

### 6.3 Chạy thử

```bash
npm start
```

Mở `http://localhost:3000`, Freighter sẽ tự popup xin connect (do `useEffect` gọi `connectWallet()` ngay khi load trang).

---

## Phần 7 — Tổng kết luồng hoạt động đầy đủ

```
1. Viết contract (lib.rs)
        ↓
2. Build → file .wasm
        ↓
3. Deploy lên testnet → có Contract ID
        ↓
4. Mint token bằng CLI vào 1 địa chỉ ví (qua "alice" ký)
        ↓
5. Cài Freighter, đổi sang testnet, lấy địa chỉ G...
        ↓
6. Mở web app → Freighter connect → đọc balance
        ↓
7. Bấm Send → contract.transfer() → Freighter ký → gửi lên blockchain
```

**Điểm hay nhầm lẫn nhất:** Mint (Phần 4) và Transfer (Phần 6) là 2 hàm khác nhau, dùng 2 "người ký" khác nhau:
- **Mint**: bạn dùng CLI + tài khoản `alice` để tự cấp token cho bất kỳ ai (vì hàm không check quyền).
- **Transfer**: phải dùng đúng ví sở hữu số dư đó để ký qua Freighter, vì có `require_auth()`.

---

## Lưu ý bảo mật khi mở rộng sau này

Nếu muốn dùng thật (không chỉ học), cần sửa thêm:
- Thêm kiểm tra quyền admin cho `mint` (hiện ai gọi cũng được).
- Cân nhắc dùng chuẩn token SEP-41 của Stellar thay vì tự viết để tương thích ví/exchange khác.
- Thêm sự kiện (`event`) để các app khác theo dõi được lịch sử mint/transfer.
