import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
} from "convex/server"
import type schema from "../schema"
import type { GenericId } from "convex/values"

export type Id<TableName extends string> = GenericId<TableName>
export type DataModel = DataModelFromSchemaDefinition<typeof schema>
export type TableNames = TableNamesInDataModel<DataModel>
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>
