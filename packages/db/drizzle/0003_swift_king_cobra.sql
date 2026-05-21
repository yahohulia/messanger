CREATE TABLE `hidden_contact` (
	`user_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `contact_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
