import type { Collection } from "@rarible/api-client"
import { ItemId } from "@rarible/api-client"
// import { ItemId } from "@rarible/types";
import { Creator } from "@rarible/api-client/build/models/Creator"
import { Royalty } from "@rarible/api-client/build/models/Royalty"
import { IBlockchainTransaction } from "@rarible/sdk-transaction/src/domain"
import { AbstractPrepareResponse } from "../../common/domain"

export type PrepareMintRequest = {
	collection: Collection
}

export type MintRequest = {
	uri: string
	supply: number
	lazyMint: boolean
	creators?: Creator[]
	royalties?: Royalty[]
}

type MintResponseCommon = {
	/**
	 * Identifier of the minted item
	 */
	itemId: ItemId
}

export enum MintType {
	OFF_CHAIN = "off-chain",
	ON_CHAIN = "on-chain"
}

export type OnChainMintResponse = MintResponseCommon & {
	type: MintType.ON_CHAIN
	transaction: IBlockchainTransaction
}

export type OffChainMintResponse = MintResponseCommon & {
	type: MintType.OFF_CHAIN
}

export type MintResponse = OnChainMintResponse | OffChainMintResponse

export interface PrepareMintResponse extends AbstractPrepareResponse<"mint", MintRequest, MintResponse>{
	multiple: boolean,
	supportsRoyalties: boolean
	supportsLazyMint: boolean
}

export interface IMint {
	prepare: (request: PrepareMintRequest) => Promise<PrepareMintResponse>
}
