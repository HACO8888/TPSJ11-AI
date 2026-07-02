ALTER TABLE "users" ADD COLUMN "can_upload" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "save_folder_id" text;