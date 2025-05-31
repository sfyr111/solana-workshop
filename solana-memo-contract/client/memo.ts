import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';

export class Memo {
    is_initialized: boolean;
    authorized: Uint8Array;
    content: string;

    constructor(fields: {is_initialized: boolean, authorized: Uint8Array, content: string}) {
        this.is_initialized = fields.is_initialized;
        this.authorized = fields.authorized;
        this.content = fields.content;
    }
    
    static schema = new Map([
        [
            Memo, 
            {
                kind: 'struct',
                fields: [
                    ['is_initialized', 'u8'], // boolean as u8
                    ['authorized', [32]], // public key as 32 bytes
                    ['content', 'string'], // string
                ]
            }
        ]
    ]);
}

export enum MemoInstruction {
    Initialize = 0,
    Update = 1,
    Delete = 2,
}

export function createInstructionData(instruction: MemoInstruction, content?: string): Buffer {
    let data;
    
    switch (instruction) {
        case MemoInstruction.Initialize:
            const initLayout = new Map([
                [
                    Object,
                    {
                        kind: 'struct',
                        fields: [
                            ['variant', 'u8'],
                            ['content', 'string'],
                        ]
                    }
                ]
            ]);
            data = borsh.serialize(initLayout, {
                variant: 0,
                content: content || '',
            });
            break;
        case MemoInstruction.Update:
            const updateLayout = new Map([
                [
                    Object,
                    {
                        kind: 'struct',
                        fields: [
                            ['variant', 'u8'],
                            ['content', 'string'],
                        ]
                    }
                ]
            ]);
            data = borsh.serialize(updateLayout, {
                variant: 1,
                content: content || '',
            });
            break;
        case MemoInstruction.Delete:
            const deleteLayout = new Map([
                [
                    Object,
                    {
                        kind: 'struct',
                        fields: [
                            ['variant', 'u8'],
                        ]
                    }
                ]
            ]);
            data = borsh.serialize(deleteLayout, {
                variant: 2,
            });
            break;
        default:
            throw new Error('Invalid instruction');
    }
    return Buffer.from(data);
}

export function formatMemoData(memo: Memo): any {
    return {
        is_initialized: memo.is_initialized ? true : false,
        authorized: new PublicKey(memo.authorized).toBase58(),
        content: memo.content,
    };
}

