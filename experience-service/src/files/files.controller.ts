import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DeleteFileCommandDto, StoreFileCommandDto } from './dto/file.dto';
import { FilesService } from './files.service';

@ApiTags('internal-files')
@ApiSecurity('internal-token')
@Controller('internal/v1/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @ApiOperation({ summary: 'ذخیره فایل مجاز برای فراخواننده داخلی' })
  async store(@Body() command: StoreFileCommandDto) {
    return {
      success: true,
      data: await this.files.store(command.actor, command.file),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف فایل توسط مالک آن' })
  async delete(@Param('id') id: string, @Body() command: DeleteFileCommandDto) {
    return { success: true, data: await this.files.delete(command.actor, id) };
  }
}
