import { PublicKey } from "@solana/web3.js";
import { getConnection, loadAccountInfo } from "../utils";
import { formatMemoData, Memo } from "../memo";
import * as borsh from "borsh";

async function readMemo(memoAccount: PublicKey) {
    const connection = getConnection();
    const accountInfo = await connection.getAccountInfo(memoAccount);

    if (!accountInfo) {
        throw new Error('Memo account not found');
    }

    const memo = borsh.deserialize(Memo.schema, Memo, accountInfo.data);
    return formatMemoData(memo);
}

const label = process.argv[2] || 'memo';

try {
    const memoAccount = loadAccountInfo(label);
    console.log(`read memo account (${label}): ${memoAccount.toBase58()}`);
    
    readMemo(memoAccount).then(data => {
      console.log('memo content:');
      console.log(JSON.stringify(data, null, 2));
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }