using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ParentalControl.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDevicePin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PinHash",
                table: "Devices",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinHash",
                table: "Devices");
        }
    }
}
