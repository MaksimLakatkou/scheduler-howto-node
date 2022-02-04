require("date-format-lite"); // add date format

class Storage {
	constructor(connection, table) {
		this._db = connection;
		this.table = "events";
	}

	// get events from the table, use dynamic loading if parameters sent
	async getAll(params) {
		let query = "SELECT * FROM ??";
		let queryParams = [
			this.table
		];

		if (params.from && params.to) {
			query += " WHERE `end_date` >= ? AND `start_date` < ?";
			queryParams.push(params.from);
			queryParams.push(params.to);
		}

		let result = await this._db.query(query, queryParams);

		result.forEach((entry) => {
			// format date and time
			entry.start_date = entry.start_date.format("YYYY-MM-DD hh:mm");
			entry.end_date = entry.end_date.format("YYYY-MM-DD hh:mm");
		});
		return result;
	}

	// create a new event
	async insert(data) {
		let sql = "INSERT INTO ?? " +
			"(`start_date`, `end_date`, `text`, `event_pid`, `event_length`, `rec_type`) " +
			"VALUES (?, ?, ?, ?, ?, ?)";

		const result = await this._db.query(
			sql,
			[
				this.table,
				data.start_date,
				data.end_date,
				data.text,
				data.event_pid || 0, //!
				data.event_length || 0, //!
				data.rec_type //!
			]);

		// delete a single occurrence from a recurring series
		let action = "inserted";
		if (data.rec_type == "none") {
			action = "deleted";
		}

		return {
			action: action,
			tid: result.insertId
		};
	}

	// update an event
	async update(id, data) {
		if (data.rec_type && data.rec_type != "none") {
			//all modified occurrences must be deleted when you update a recurring series
			//https://docs.dhtmlx.com/scheduler/server_integration.html#recurringevents
			await this._db.query(
				"DELETE FROM ?? WHERE `event_pid`= ?;",
				[this.table, id]);
		}

		await this._db.query(
			"UPDATE ?? SET " +
			"`start_date` = ?, `end_date` = ?, `text` = ?, " +
			"`event_pid` = ?, `event_length`= ?, `rec_type` = ? " +
			"WHERE id = ?",
			[
				this.table,
				data.start_date,
				data.end_date,
				data.text,
				data.event_pid || 0,
				data.event_length || 0,
				data.rec_type,
				id
			]);

		return {
			action: "updated"
		};
	}

	// delete an event
	async delete(id) {
		// some logic specific to the recurring events support
		// https://docs.dhtmlx.com/scheduler/server_integration.html#recurringevents
		let event = await this._db.query(
			"SELECT * FROM ?? WHERE id=? LIMIT 1;",
			[this.table, id]);

		if (event.event_pid) {
			// deleting modified occurrence from a recurring series
			// If an event with the event_pid value was deleted,
			// it should be updated with "rec_type==none" instead of deleting.
			event.rec_type = "none";
			return await this.update(id, event);
		}

		if (event.rec_type && event.rec_type != "none") {
			// if a recurring series deleted, delete all modified occurrences of the series
			await this._db.query(
				"DELETE FROM ?? WHERE `event_pid`=? ;",
				[this.table, id]);
		}

		await this._db.query(
			"DELETE FROM ?? WHERE `id`= ?;",
			[this.table, id]);

		return {
			action: "deleted"
		}
	}
}

module.exports = Storage;
