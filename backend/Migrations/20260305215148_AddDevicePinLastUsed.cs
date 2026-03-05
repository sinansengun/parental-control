using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ParentalControl.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDevicePinLastUsed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "LastPinUsedAt",
                table: "Devices",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastPinUsedAt",
                table: "Devices");
        }
    }
}
